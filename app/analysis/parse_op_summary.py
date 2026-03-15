#!/usr/bin/env python3
"""解析 op_summary CSV 文件，提取 Top-N 慢算子并给出分析建议。

核心功能：
- Top-N 慢算子排序（按耗时占 end-to-end 比例）
- 算子 Input Shapes 解析
- Cube (AI_CORE MatMul) vs Vector (AI_VECTOR_CORE) 耗时比例
- 按 OP Type 分组汇总
- 自动优化建议

用法:
  python parse_op_summary.py -f op_summary_0.csv -n 20
  python parse_op_summary.py -f op_summary_0.csv -n 20 --json
  python parse_op_summary.py -f op_summary_0.csv --analyze
  python parse_op_summary.py -f op_summary_0.csv --filter-type AI_CORE
"""

import argparse
import csv
import heapq
import json
import sys
from collections import defaultdict


# op_summary 中常见的耗时字段名（不同 CANN 版本可能不同）
DURATION_FIELDS = [
    "Task Duration(us)",
    "Task Duration",
    "Duration(us)",
    "Duration",
]

# 所有可能有用的字段
ALL_FIELDS = [
    "OP Name", "Op Name",
    "OP Type", "Op Type",
    "Task Duration(us)", "Task Duration", "Duration(us)", "Duration",
    "Task Type",
    "Block Dim",
    "Input Shapes", "Input Data Types", "Input Formats",
    "Output Shapes", "Output Data Types", "Output Formats",
    "Mac Ratio", "Vec Ratio", "Scalar Ratio",
    "MTE1 Ratio", "MTE2 Ratio", "MTE3 Ratio",
    "Task Wait Time(us)", "Task Start Time(us)",
    "aiv_vec_ratio", "aic_mac_ratio", "aic_mte2_ratio",
]


def find_duration_field(fieldnames):
    for f in DURATION_FIELDS:
        if f in fieldnames:
            return f
    return None


def find_available_fields(fieldnames):
    return [f for f in ALL_FIELDS if f in fieldnames]


def parse_float(val):
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def get_field(row, *candidates):
    """从多个候选字段名中取值。"""
    for c in candidates:
        v = row.get(c)
        if v is not None and v != "":
            return v
    return ""


def classify_task_type(task_type_str):
    """将 Task Type / Accelerator Core 归类为 cube/vector/aicpu/other。"""
    t = task_type_str.upper().strip()
    if "AI_CORE" in t and "VECTOR" not in t:
        return "cube"
    if "AI_VECTOR" in t or "VECTOR_CORE" in t:
        return "vector"
    if "MIX_AIV" in t or "MIX_AIC" in t:
        return "mix"
    if "AI_CPU" in t or "AICPU" in t:
        return "aicpu"
    if "DSA" in t:
        return "other"
    return "other"


def read_all_ops(filepath):
    """读取所有算子数据。"""
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        duration_field = find_duration_field(reader.fieldnames)
        if not duration_field:
            print(f"错误: 未找到耗时字段，可用字段: {reader.fieldnames}", file=sys.stderr)
            sys.exit(1)

        available = find_available_fields(reader.fieldnames)
        rows = []
        for row in reader:
            entry = {k: row.get(k, "") for k in available}
            entry["_duration"] = parse_float(row.get(duration_field, 0))
            entry["_name"] = get_field(row, "OP Name", "Op Name", "Name")
            entry["_type"] = get_field(row, "OP Type", "Op Type", "Type")
            entry["_task_type"] = get_field(row, "Task Type", "Accelerator Core")
            entry["_input_shapes"] = get_field(row, "Input Shapes")
            entry["_block_dim"] = get_field(row, "Block Dim")
            entry["_category"] = classify_task_type(entry["_task_type"])
            # PipeUtilization metrics (if available)
            entry["_mac_ratio"] = parse_float(get_field(row, "aic_mac_ratio", "Mac Ratio"))
            entry["_vec_ratio"] = parse_float(get_field(row, "aiv_vec_ratio", "Vec Ratio"))
            entry["_mte2_ratio"] = parse_float(get_field(row, "aic_mte2_ratio", "MTE2 Ratio"))
            entry["_cube_util"] = parse_float(get_field(row, "cube_utilization(%)", ""))
            rows.append(entry)

    return rows, duration_field


def top_n_ops(rows, n, filter_type=None):
    """使用 heapq 获取 Top-N 慢算子。"""
    heap = []
    total_time = 0.0
    count = 0

    for i, row in enumerate(rows):
        dur = row["_duration"]
        total_time += dur
        count += 1

        if filter_type:
            if filter_type.upper() not in row["_task_type"].upper():
                continue

        entry = (dur, i, row)
        if len(heap) < n:
            heapq.heappush(heap, entry)
        elif dur > heap[0][0]:
            heapq.heapreplace(heap, entry)

    results = sorted(heap, key=lambda x: x[0], reverse=True)
    return results, total_time, count


def compute_type_breakdown(rows):
    """按 OP Type 分组汇总。"""
    type_stats = defaultdict(lambda: {"count": 0, "total_time": 0.0, "names": set()})
    total = sum(r["_duration"] for r in rows)

    for row in rows:
        op_type = row["_type"] or "Unknown"
        type_stats[op_type]["count"] += 1
        type_stats[op_type]["total_time"] += row["_duration"]
        type_stats[op_type]["names"].add(row["_name"])

    result = []
    for op_type, stats in sorted(type_stats.items(), key=lambda x: x[1]["total_time"], reverse=True):
        pct = stats["total_time"] / total * 100 if total > 0 else 0
        result.append({
            "op_type": op_type,
            "count": stats["count"],
            "total_time_us": stats["total_time"],
            "percentage": round(pct, 2),
            "unique_ops": len(stats["names"]),
        })
    return result, total


def compute_cube_vector_ratio(rows):
    """计算 Cube (AI_CORE) vs Vector (AI_VECTOR_CORE) vs AICPU 耗时比例。"""
    stats = defaultdict(lambda: {"count": 0, "total_time": 0.0})
    total = sum(r["_duration"] for r in rows)

    for row in rows:
        cat = row["_category"]
        stats[cat]["count"] += 1
        stats[cat]["total_time"] += row["_duration"]

    result = {}
    for cat in ["cube", "vector", "mix", "aicpu", "other"]:
        s = stats[cat]
        pct = s["total_time"] / total * 100 if total > 0 else 0
        result[cat] = {
            "count": s["count"],
            "total_time_us": round(s["total_time"], 1),
            "percentage": round(pct, 2),
        }

    return result, total


def generate_suggestions(rows, top_results, total_time, cube_vector):
    """基于分析结果生成优化建议。"""
    suggestions = []

    # 1. AICPU 算子检查
    aicpu = cube_vector.get("aicpu", {})
    if aicpu.get("percentage", 0) > 1.0:
        aicpu_ops = [r for r in rows if r["_category"] == "aicpu"]
        aicpu_types = defaultdict(float)
        for op in aicpu_ops:
            aicpu_types[op["_type"]] += op["_duration"]
        top_aicpu = sorted(aicpu_types.items(), key=lambda x: x[1], reverse=True)[:5]
        types_str = ", ".join(f"{t}({d:.0f}us)" for t, d in top_aicpu)
        suggestions.append({
            "priority": "HIGH",
            "category": "AICPU",
            "issue": f"AI_CPU 算子占总耗时 {aicpu['percentage']:.1f}%（{aicpu['count']} 个算子）",
            "detail": f"Top AICPU 算子类型: {types_str}",
            "action": "替换为 AI Core 实现（使用 torch_npu 亲和 API 或算子融合），参见 advisor AICPU Issues",
        })

    # 2. Top 算子集中度
    if top_results:
        top5_time = sum(dur for dur, _, _ in top_results[:5])
        top5_pct = top5_time / total_time * 100 if total_time > 0 else 0
        if top5_pct > 60:
            top5_info = []
            for dur, _, row in top_results[:5]:
                pct = dur / total_time * 100
                top5_info.append(f"{row['_name'][:30]}({row['_type']}, {pct:.1f}%)")
            suggestions.append({
                "priority": "HIGH",
                "category": "热点集中",
                "issue": f"Top-5 算子占总耗时 {top5_pct:.1f}%，优化收益大",
                "detail": "; ".join(top5_info),
                "action": "重点优化这些算子：检查 Input Shapes 是否对齐、是否可融合、是否可用更高效实现",
            })

    # 3. Block Dim 不足
    low_block_ops = []
    for dur, _, row in top_results[:20]:
        bd = row.get("_block_dim", "")
        try:
            bd_val = int(bd)
            if bd_val < 8 and row["_category"] in ("cube", "vector", "mix"):
                low_block_ops.append(f"{row['_name'][:25]}(BlockDim={bd_val})")
        except (ValueError, TypeError):
            pass
    if low_block_ops:
        suggestions.append({
            "priority": "MEDIUM",
            "category": "Block Dim",
            "issue": f"{len(low_block_ops)} 个慢算子 Block Dim < 8，并行度不足",
            "detail": "; ".join(low_block_ops[:5]),
            "action": "调整输入 Shape 使算子能利用更多 AI Core（增大 batch/seq_len，对齐到 16 的倍数）",
        })

    # 4. Vector 算子占比过高
    vec = cube_vector.get("vector", {})
    if vec.get("percentage", 0) > 30:
        suggestions.append({
            "priority": "MEDIUM",
            "category": "Vector 占比",
            "issue": f"AI_VECTOR_CORE 算子占比 {vec['percentage']:.1f}%，通常意味着大量 Elementwise 操作",
            "detail": "",
            "action": "考虑算子融合（如 LayerNorm+Add、Activation 融合），减少 Elementwise kernel 数量",
        })

    # 5. Memory-bound MatMul ops (using pipe metrics)
    mem_bound_matmuls = []
    for dur, _, row in top_results[:20]:
        mac = row.get("_mac_ratio", 0)
        mte2 = row.get("_mte2_ratio", 0)
        if mte2 > mac and mte2 > 0.5 and "MatMul" in row["_type"]:
            shapes = row["_input_shapes"][:40]
            mem_bound_matmuls.append(f"{row['_type']}(mte2={mte2:.2f},mac={mac:.2f}) shapes={shapes}")
    if mem_bound_matmuls:
        suggestions.append({
            "priority": "HIGH",
            "category": "Memory Bound MatMul",
            "issue": f"{len(mem_bound_matmuls)} 个 Top 慢 MatMul 算子为搬运受限（MTE2 ratio > Mac ratio）",
            "detail": "; ".join(mem_bound_matmuls[:3]),
            "action": "优化数据布局（FRACTAL_NZ 格式）、确保 M/N/K 维度对齐到 16 的倍数、考虑使用 FlashAttention 替代手动 QKV matmul",
        })

    # 6. Low utilization vector ops
    low_util_vec = []
    for dur, _, row in top_results[:20]:
        vec = row.get("_vec_ratio", 0)
        if 0 < vec < 0.1 and row["_category"] == "vector":
            pct = dur / total_time * 100
            low_util_vec.append(f"{row['_type']}(vec={vec:.2f},{pct:.1f}%)")
    if low_util_vec:
        suggestions.append({
            "priority": "MEDIUM",
            "category": "低效 Vector 算子",
            "issue": f"{len(low_util_vec)} 个 Top 算子 Vector 利用率 < 10%，搬运开销可能大于计算",
            "detail": "; ".join(low_util_vec[:5]),
            "action": "这些算子可能是纯数据转换（Cast/Transpose），检查是否可以消除或融合",
        })

    # 7. 同名算子大量重复
    name_counts = defaultdict(lambda: {"count": 0, "total_time": 0.0, "type": ""})
    for row in rows:
        key = row["_type"]
        name_counts[key]["count"] += 1
        name_counts[key]["total_time"] += row["_duration"]
        name_counts[key]["type"] = row["_type"]
    for op_type, info in name_counts.items():
        if info["count"] > 100 and info["total_time"] / total_time > 0.05:
            pct = info["total_time"] / total_time * 100
            suggestions.append({
                "priority": "MEDIUM",
                "category": "算子融合",
                "issue": f"{op_type} 类型算子出现 {info['count']} 次，占总耗时 {pct:.1f}%",
                "detail": "",
                "action": "检查是否可通过 torch.compile 或 torch_npu 融合 API 减少调用次数",
            })

    return suggestions


# ── Output Formatters ─────────────────────────────────────────────────────────

def format_analyze(rows, duration_field):
    """完整分析模式输出。"""
    total_time = sum(r["_duration"] for r in rows)
    top_results, _, count = top_n_ops(rows, 20)
    type_breakdown, _ = compute_type_breakdown(rows)
    cube_vector, _ = compute_cube_vector_ratio(rows)
    suggestions = generate_suggestions(rows, top_results, total_time, cube_vector)

    print("=" * 80)
    print("  昇腾 NPU 算子性能分析报告")
    print("=" * 80)
    print(f"\n总算子数: {count}，总耗时: {total_time:.1f} us ({total_time/1e6:.3f} s)")
    print(f"耗时字段: {duration_field}")

    # Section 1: Cube vs Vector ratio
    print(f"\n{'─' * 80}")
    print("  [1] Cube / Vector / AICPU 耗时分布")
    print(f"{'─' * 80}\n")
    for cat_name, label in [("cube", "AI_CORE (Cube/MatMul)"),
                             ("vector", "AI_VECTOR_CORE"),
                             ("mix", "MIX_AIV"),
                             ("aicpu", "AI_CPU"),
                             ("other", "Other")]:
        info = cube_vector.get(cat_name, {})
        cnt = info.get("count", 0)
        t = info.get("total_time_us", 0)
        pct = info.get("percentage", 0)
        bar = "█" * int(pct / 2) + "░" * (50 - int(pct / 2))
        print(f"  {label:<25s}  {bar}  {pct:5.1f}%  ({cnt:5d} ops, {t:12.1f} us)")

    # Section 2: Top-20 ops
    # Check if any ops have pipe utilization data
    has_pipe_metrics = any(row.get("_mac_ratio", 0) > 0 or row.get("_vec_ratio", 0) > 0
                          for _, _, row in top_results)

    print(f"\n{'─' * 80}")
    print("  [2] Top-20 慢算子（按耗时占比排序）")
    print(f"{'─' * 80}\n")

    if has_pipe_metrics:
        header = f"{'#':>3s}  {'算子名称':<30s}  {'类型':<15s}  {'耗时(us)':>10s}  {'占比':>6s}  {'累计':>6s}  {'Task Type':<12s}  {'Mac':>5s}  {'Vec':>5s}  {'MTE2':>5s}  {'Bound':<8s}  {'Input Shapes':<25s}"
    else:
        header = f"{'#':>3s}  {'算子名称':<35s}  {'类型':<18s}  {'耗时(us)':>12s}  {'占比':>7s}  {'累计':>7s}  {'Task Type':<14s}  {'Input Shapes':<30s}"
    print(header)
    print("-" * len(header))

    cumulative = 0.0
    for i, (dur, _, row) in enumerate(top_results, 1):
        pct = dur / total_time * 100 if total_time > 0 else 0
        cumulative += pct

        if has_pipe_metrics:
            name = row["_name"][:30]
            op_type = row["_type"][:15]
            task_type = row["_task_type"][:12]
            shapes = row["_input_shapes"][:25]
            mac = row.get("_mac_ratio", 0)
            vec = row.get("_vec_ratio", 0)
            mte2 = row.get("_mte2_ratio", 0)
            # Determine bound type
            if mac > 0 or vec > 0 or mte2 > 0:
                if mac > mte2 and mac > vec:
                    bound = "Compute"
                elif mte2 > mac and mte2 > vec:
                    bound = "Memory"
                elif vec > mac:
                    bound = "Vector"
                else:
                    bound = "-"
                mac_s = f"{mac:.2f}" if mac > 0 else "-"
                vec_s = f"{vec:.2f}" if vec > 0 else "-"
                mte2_s = f"{mte2:.2f}" if mte2 > 0 else "-"
            else:
                bound = "-"
                mac_s = vec_s = mte2_s = "-"
            print(f"{i:3d}  {name:<30s}  {op_type:<15s}  {dur:10.1f}  {pct:5.1f}%  {cumulative:5.1f}%  {task_type:<12s}  {mac_s:>5s}  {vec_s:>5s}  {mte2_s:>5s}  {bound:<8s}  {shapes:<25s}")
        else:
            name = row["_name"][:35]
            op_type = row["_type"][:18]
            task_type = row["_task_type"][:14]
            shapes = row["_input_shapes"][:30]
            print(f"{i:3d}  {name:<35s}  {op_type:<18s}  {dur:12.1f}  {pct:6.2f}%  {cumulative:6.1f}%  {task_type:<14s}  {shapes:<30s}")

    # Section 3: Type breakdown
    print(f"\n{'─' * 80}")
    print("  [3] 按 OP Type 分组汇总（Top-15）")
    print(f"{'─' * 80}\n")
    header2 = f"  {'OP Type':<30s}  {'调用次数':>8s}  {'总耗时(us)':>14s}  {'占比':>7s}  {'累计':>7s}"
    print(header2)
    print("  " + "-" * (len(header2) - 2))

    cum2 = 0.0
    for item in type_breakdown[:15]:
        cum2 += item["percentage"]
        print(f"  {item['op_type']:<30s}  {item['count']:8d}  {item['total_time_us']:14.1f}  {item['percentage']:6.2f}%  {cum2:6.1f}%")

    # Section 4: Suggestions
    if suggestions:
        print(f"\n{'─' * 80}")
        print("  [4] 优化建议")
        print(f"{'─' * 80}\n")
        for i, s in enumerate(suggestions, 1):
            print(f"  [{s['priority']}] {i}. {s['issue']}")
            if s.get("detail"):
                print(f"       详情: {s['detail']}")
            print(f"       建议: {s['action']}")
            print()
    else:
        print("\n  未发现明显性能问题。")

    print("=" * 80)


def format_table(results, total_time, total_count, duration_field):
    """简单表格输出。"""
    print(f"总算子数: {total_count}，总耗时: {total_time:.1f} us\n")

    header = f"{'#':>3s}  {'算子名称':<40s}  {'类型':<20s}  {'耗时(us)':>12s}  {'占比(%)':>8s}  {'Task Type':<16s}  {'Block Dim':>9s}  {'Input Shapes':<30s}"
    print(header)
    print("-" * len(header))

    cumulative = 0.0
    for i, (dur, _, row) in enumerate(results, 1):
        name = row["_name"][:40]
        op_type = row["_type"][:20]
        task_type = row["_task_type"][:16]
        block_dim = row.get("_block_dim", "")
        shapes = row["_input_shapes"][:30]
        pct = dur / total_time * 100 if total_time > 0 else 0
        cumulative += pct
        print(f"{i:3d}  {name:<40s}  {op_type:<20s}  {dur:12.1f}  {pct:7.2f}%  {task_type:<16s}  {block_dim:>9s}  {shapes:<30s}")

    print(f"\nTop-{len(results)} 累计占比: {cumulative:.1f}%")


def format_json(rows, n, filter_type):
    """输出 JSON 格式（完整分析）。"""
    total_time = sum(r["_duration"] for r in rows)
    top_results, _, count = top_n_ops(rows, n, filter_type)
    type_breakdown, _ = compute_type_breakdown(rows)
    cube_vector, _ = compute_cube_vector_ratio(rows)
    suggestions = generate_suggestions(rows, top_results, total_time, cube_vector)

    output = {
        "summary": {
            "total_ops": count,
            "total_time_us": round(total_time, 1),
            "total_time_s": round(total_time / 1e6, 4),
        },
        "cube_vector_ratio": cube_vector,
        "top_ops": [],
        "type_breakdown": type_breakdown[:15],
        "suggestions": suggestions,
    }

    cumulative = 0.0
    for dur, _, row in top_results:
        pct = dur / total_time * 100 if total_time > 0 else 0
        cumulative += pct
        mac = row.get("_mac_ratio", 0)
        vec = row.get("_vec_ratio", 0)
        mte2 = row.get("_mte2_ratio", 0)
        if mac > mte2 and mac > vec and mac > 0:
            bound = "compute"
        elif mte2 > mac and mte2 > vec and mte2 > 0:
            bound = "memory"
        elif vec > mac and vec > 0:
            bound = "vector"
        else:
            bound = "unknown"
        output["top_ops"].append({
            "name": row["_name"],
            "type": row["_type"],
            "duration_us": dur,
            "percentage": round(pct, 2),
            "cumulative_pct": round(cumulative, 1),
            "task_type": row["_task_type"],
            "category": row["_category"],
            "input_shapes": row["_input_shapes"],
            "block_dim": row.get("_block_dim", ""),
            "aic_mac_ratio": mac,
            "aiv_vec_ratio": vec,
            "aic_mte2_ratio": mte2,
            "cube_utilization": row.get("_cube_util", 0),
            "bound": bound,
        })

    print(json.dumps(output, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="解析 op_summary CSV → 算子性能分析")
    parser.add_argument("-f", "--file", required=True, help="op_summary CSV 文件路径")
    parser.add_argument("-n", "--top", type=int, default=20, help="Top-N 数量（默认 20）")
    parser.add_argument("--json", action="store_true", help="输出 JSON 格式（含完整分析）")
    parser.add_argument("--analyze", action="store_true",
                        help="完整分析模式：Top-N + 类型分布 + Cube/Vector比 + 建议")
    parser.add_argument("--filter-type", help="按 Task Type 过滤（如 AI_CORE, AI_CPU）")

    args = parser.parse_args()

    rows, duration_field = read_all_ops(args.file)
    if not rows:
        print("未找到算子数据。")
        return

    if args.json:
        format_json(rows, args.top, args.filter_type)
    elif args.analyze:
        format_analyze(rows, duration_field)
    else:
        results, total_time, total_count = top_n_ops(rows, args.top, args.filter_type)
        if not results:
            print("未找到匹配的算子数据。")
            return
        format_table(results, total_time, total_count, duration_field)


if __name__ == "__main__":
    main()
