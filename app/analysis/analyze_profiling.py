#!/usr/bin/env python3
"""综合性能分析脚本 — 从 profiling 数据目录自动发现并分析所有关键 CSV 文件。

这是 agent 的主要分析入口。输入一个 profiling 数据目录，自动：
1. 发现 op_summary / kernel_details CSV
2. 发现 step_trace CSV
3. 发现 communication_statistic CSV
4. 发现 operator_details CSV（通信算子 shape 分析）
5. 生成综合分析报告（Top 算子 + 占比 + Shape + Cube/Vector + 建议）

用法:
  python analyze_profiling.py -d ./profiling_output
  python analyze_profiling.py -d ./profiling_output --json
  python analyze_profiling.py -d ./profiling_output -n 30

工作原理:
  脚本会递归搜索指定目录，查找以下文件模式:
  - op_summary*.csv / kernel_details*.csv  → 算子分析
  - step_trace*.csv                        → 迭代时间分解
  - communication*.csv / hccl*.csv         → 通信分析
  - operator_details*.csv                  → 通信算子 Shape 分析
"""

import argparse
import csv
import json
import math
import os
import sys
from collections import defaultdict
from pathlib import Path


# ── CSV Discovery ─────────────────────────────────────────────────────────────

def find_csv_files(base_dir, patterns):
    """递归搜索匹配的 CSV 文件。"""
    base = Path(base_dir)
    results = []
    for p in base.rglob("*.csv"):
        name_lower = p.name.lower()
        for pat in patterns:
            if pat in name_lower:
                results.append(p)
                break
    return sorted(results)


def find_profiling_csvs(base_dir):
    """发现所有关键 CSV 文件。优先使用 kernel_details（新格式），避免重复分析。"""
    op_files = find_csv_files(base_dir, ["kernel_details"])
    if not op_files:
        op_files = find_csv_files(base_dir, ["op_summary"])
    else:
        # Only keep one kernel_details (prefer ASCEND_PROFILER_OUTPUT)
        ascend_files = [f for f in op_files if "ASCEND_PROFILER_OUTPUT" in str(f)]
        if ascend_files:
            op_files = ascend_files[:1]
        else:
            op_files = op_files[:1]
    step_files = find_csv_files(base_dir, ["step_trace"])
    comm_files = find_csv_files(base_dir, ["communication_statistic", "hccl_statistic"])
    op_detail_files = find_csv_files(base_dir, ["operator_details"])
    return {
        "op_summary": op_files,
        "step_trace": step_files,
        "communication": comm_files,
        "operator_details": op_detail_files,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_float(val):
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def get_field(row, *candidates):
    for c in candidates:
        v = row.get(c)
        if v is not None and v != "":
            return v
    return ""


def classify_task_type(task_type_str):
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


# ── Op Summary Analysis ──────────────────────────────────────────────────────

DURATION_FIELDS = ["Task Duration(us)", "Duration(us)", "Task Duration", "Duration"]

def analyze_op_summary(filepath, top_n=20):
    """分析 op_summary CSV，返回结构化结果。"""
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []

        dur_field = None
        for df in DURATION_FIELDS:
            if df in fieldnames:
                dur_field = df
                break
        if not dur_field:
            return None

        rows = []
        for row in reader:
            dur = parse_float(row.get(dur_field, 0))
            name = get_field(row, "OP Name", "Op Name", "Name")
            op_type = get_field(row, "OP Type", "Op Type", "Type")
            task_type = get_field(row, "Task Type", "Accelerator Core")
            shapes = get_field(row, "Input Shapes")
            block_dim = get_field(row, "Block Dim")
            category = classify_task_type(task_type)

            mac = parse_float(get_field(row, "aic_mac_ratio", "Mac Ratio"))
            vec = parse_float(get_field(row, "aiv_vec_ratio", "Vec Ratio"))
            mte2 = parse_float(get_field(row, "aic_mte2_ratio", "MTE2 Ratio"))
            cube_util = parse_float(get_field(row, "cube_utilization(%)", ""))

            rows.append({
                "name": name,
                "type": op_type,
                "duration": dur,
                "task_type": task_type,
                "category": category,
                "shapes": shapes,
                "block_dim": block_dim,
                "mac_ratio": mac,
                "vec_ratio": vec,
                "mte2_ratio": mte2,
                "cube_util": cube_util,
            })

    total_time = sum(r["duration"] for r in rows)
    total_count = len(rows)

    # Top-N
    sorted_rows = sorted(rows, key=lambda x: x["duration"], reverse=True)
    top_ops = sorted_rows[:top_n]

    # Cube vs Vector breakdown
    cat_stats = defaultdict(lambda: {"count": 0, "time": 0.0})
    for r in rows:
        cat_stats[r["category"]]["count"] += 1
        cat_stats[r["category"]]["time"] += r["duration"]

    cube_vector = {}
    for cat in ["cube", "vector", "mix", "aicpu", "other"]:
        s = cat_stats[cat]
        pct = s["time"] / total_time * 100 if total_time > 0 else 0
        cube_vector[cat] = {"count": s["count"], "time_us": round(s["time"], 1), "pct": round(pct, 2)}

    # Type breakdown
    type_stats = defaultdict(lambda: {"count": 0, "time": 0.0})
    for r in rows:
        type_stats[r["type"]]["count"] += 1
        type_stats[r["type"]]["time"] += r["duration"]
    type_breakdown = []
    for tp, st in sorted(type_stats.items(), key=lambda x: x[1]["time"], reverse=True):
        pct = st["time"] / total_time * 100 if total_time > 0 else 0
        type_breakdown.append({"type": tp, "count": st["count"], "time_us": round(st["time"], 1), "pct": round(pct, 2)})

    # Suggestions
    suggestions = []

    # AICPU check
    aicpu_info = cube_vector.get("aicpu", {})
    if aicpu_info.get("pct", 0) > 1.0:
        aicpu_types = defaultdict(float)
        for r in rows:
            if r["category"] == "aicpu":
                aicpu_types[r["type"]] += r["duration"]
        top_aicpu = sorted(aicpu_types.items(), key=lambda x: x[1], reverse=True)[:5]
        suggestions.append(f"[HIGH] AI_CPU 算子占 {aicpu_info['pct']:.1f}%。Top 类型: {', '.join(f'{t}({d:.0f}us)' for t,d in top_aicpu)}。建议替换为 AI Core 实现。")

    # Top-5 concentration
    if top_ops:
        top5_time = sum(o["duration"] for o in top_ops[:5])
        top5_pct = top5_time / total_time * 100 if total_time > 0 else 0
        if top5_pct > 50:
            ops_str = "; ".join(f"{o['name'][:25]}({o['type']},{o['duration']/total_time*100:.1f}%)" for o in top_ops[:5])
            suggestions.append(f"[HIGH] Top-5 算子占总耗时 {top5_pct:.1f}%，优化收益集中。{ops_str}")

    # Vector ratio
    vec_info = cube_vector.get("vector", {})
    if vec_info.get("pct", 0) > 30:
        suggestions.append(f"[MEDIUM] Vector 算子占比 {vec_info['pct']:.1f}%（{vec_info['count']} 个），考虑算子融合减少 Elementwise kernel 数量。")

    # Memory-bound MatMul detection
    mem_matmuls = [o for o in top_ops[:20]
                   if o.get("mte2_ratio", 0) > o.get("mac_ratio", 0) and o.get("mte2_ratio", 0) > 0.5
                   and "MatMul" in o["type"]]
    if mem_matmuls:
        detail = "; ".join(f"{o['type']}(mte2={o['mte2_ratio']:.2f}) shapes={o['shapes'][:30]}" for o in mem_matmuls[:3])
        suggestions.append(f"[HIGH] {len(mem_matmuls)} 个 Top MatMul 算子为搬运受限。{detail}。建议优化数据布局、Shape 对齐到 16 的倍数。")

    # Low-utilization vector ops
    low_vec = [o for o in top_ops[:20]
               if 0 < o.get("vec_ratio", 0) < 0.1 and o["category"] == "vector"]
    if low_vec:
        types = ", ".join(set(o["type"] for o in low_vec[:5]))
        suggestions.append(f"[MEDIUM] {len(low_vec)} 个 Top Vector 算子利用率 < 10%（{types}），可能是纯数据转换，检查是否可消除或融合。")

    # ── Jitter / 抖动 Analysis ──
    # Group by (type, shapes) to detect performance variance for same-shape ops.
    # Cube ops may show jitter due to frequency throttling (降频).

    # For communication ops (hcom_*), infer shape from predecessor's Output Shapes
    inferred_shapes = infer_comm_shapes_from_predecessors(rows)
    # Build rows with inferred shapes for grouping
    rows_with_inferred = []
    for i, r in enumerate(rows):
        r_copy = dict(r)
        if i in inferred_shapes and inferred_shapes[i]:
            r_copy["shapes"] = inferred_shapes[i]
            r_copy["shapes_inferred"] = True
        else:
            r_copy["shapes_inferred"] = False
        rows_with_inferred.append(r_copy)

    shape_groups = defaultdict(list)
    for r in rows_with_inferred:
        key = (r["type"], r["shapes"])
        shape_groups[key].append(r)

    jitter_results = []
    for (op_type, shapes), group in shape_groups.items():
        if len(group) < 3:
            continue
        durations = [r["duration"] for r in group]
        n = len(durations)
        mean = sum(durations) / n
        if mean < 1.0:
            continue
        variance = sum((x - mean) ** 2 for x in durations) / n
        std = math.sqrt(variance)
        cv = std / mean if mean > 0 else 0
        min_d = min(durations)
        max_d = max(durations)
        spread = (max_d - min_d) / mean if mean > 0 else 0
        category = group[0]["category"]
        group_total = sum(durations)
        group_pct = group_total / total_time * 100 if total_time > 0 else 0
        is_inferred = any(r.get("shapes_inferred") for r in group)

        jitter_results.append({
            "type": op_type,
            "shapes": shapes,
            "category": category,
            "count": n,
            "mean_us": round(mean, 2),
            "std_us": round(std, 2),
            "cv": round(cv, 4),
            "min_us": round(min_d, 2),
            "max_us": round(max_d, 2),
            "spread": round(spread, 4),
            "total_us": round(group_total, 1),
            "pct": round(group_pct, 2),
            "shapes_inferred": is_inferred,
        })

    # Sort by CV descending, but only keep groups with meaningful time contribution
    jitter_results = [j for j in jitter_results if j["pct"] >= 0.1]
    jitter_results.sort(key=lambda x: x["cv"], reverse=True)

    # Generate jitter suggestions
    high_jitter = [j for j in jitter_results if j["cv"] > 0.05 and j["category"] in ("cube", "mix")]
    if high_jitter:
        for j in high_jitter[:3]:
            suggestions.append(
                f"[HIGH] 抖动检测: {j['type']}(shapes={j['shapes'][:40]}) "
                f"CV={j['cv']:.2%}, mean={j['mean_us']:.1f}us, "
                f"min={j['min_us']:.1f}us, max={j['max_us']:.1f}us, "
                f"spread={j['spread']:.1%}（共{j['count']}次, 占{j['pct']:.1f}%）。"
                f"Cube/Mix 算子抖动可能由降频引起，建议检查功耗/温度或固定 NPU 频率。"
            )

    medium_jitter = [j for j in jitter_results if j["cv"] > 0.05 and j["category"] not in ("cube", "mix") and j["pct"] >= 0.5]
    if medium_jitter:
        for j in medium_jitter[:2]:
            suggestions.append(
                f"[MEDIUM] 抖动检测: {j['type']}(shapes={j['shapes'][:40]}) "
                f"CV={j['cv']:.2%}, mean={j['mean_us']:.1f}us, "
                f"min={j['min_us']:.1f}us, max={j['max_us']:.1f}us "
                f"（共{j['count']}次, 占{j['pct']:.1f}%）。"
            )

    cum = 0.0
    top_ops_output = []
    for o in top_ops:
        pct = round(o["duration"] / total_time * 100, 2) if total_time > 0 else 0
        cum += pct
        mac = o.get("mac_ratio", 0)
        vec = o.get("vec_ratio", 0)
        mte2 = o.get("mte2_ratio", 0)
        if mac > mte2 and mac > vec and mac > 0:
            bound = "compute"
        elif mte2 > mac and mte2 > vec and mte2 > 0:
            bound = "memory"
        elif vec > 0:
            bound = "vector"
        else:
            bound = "unknown"
        top_ops_output.append({
            "name": o["name"],
            "type": o["type"],
            "duration_us": o["duration"],
            "pct": pct,
            "cumulative_pct": round(cum, 2),
            "task_type": o["task_type"],
            "category": o["category"],
            "shapes": o["shapes"],
            "block_dim": o["block_dim"],
            "mac_ratio": mac,
            "vec_ratio": vec,
            "mte2_ratio": mte2,
            "cube_util": o.get("cube_util", 0),
            "bound": bound,
        })

    return {
        "file": str(filepath),
        "total_ops": total_count,
        "total_time_us": round(total_time, 1),
        "duration_field": dur_field,
        "cube_vector": cube_vector,
        "top_ops": top_ops_output,
        "type_breakdown": type_breakdown[:15],
        "jitter": jitter_results[:20],
        "suggestions": suggestions,
    }


# ── Step Trace Analysis ───────────────────────────────────────────────────────

STEP_FIELDS = ["Duration", "Computing", "Communication(Not Overlapped)", "Communication",
               "Overlapped", "Free", "Stage", "Data_aug Bound", "Iteration Refresh",
               "FP_BP Time", "Reduce"]

def analyze_step_trace(filepath):
    """分析 step_trace CSV。"""
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        available = [col for col in STEP_FIELDS if col in fieldnames]
        if not available:
            return None

        steps = []
        for row in reader:
            step = {}
            for field in available:
                step[field] = parse_float(row.get(field, 0))
            steps.append(step)

    if not steps:
        return None

    # Use 'Stage' as total step time if available (it's the full iteration time),
    # otherwise fall back to 'Duration'
    if "Stage" in available:
        total_field = "Stage"
    elif "Duration" in available:
        total_field = "Duration"
    else:
        total_field = available[0]

    total_mean = sum(s.get(total_field, 0) for s in steps) / len(steps) if steps else 0

    # Fields to report as time breakdown (exclude the total field itself)
    breakdown_fields = ["Computing", "Communication(Not Overlapped)", "Overlapped",
                        "Free", "Data_aug Bound", "Iteration Refresh", "Bubble", "Preparing"]
    report_fields = [f for f in breakdown_fields if f in available]

    breakdown = {}
    for field in report_fields:
        values = [s.get(field, 0) for s in steps]
        n = len(values)
        mean = sum(values) / n
        variance = sum((x - mean) ** 2 for x in values) / n if n > 1 else 0
        std = math.sqrt(variance)
        pct = mean / total_mean * 100 if total_mean > 0 else 0
        breakdown[field] = {
            "mean_us": round(mean, 1),
            "std_us": round(std, 1),
            "min_us": round(min(values), 1),
            "max_us": round(max(values), 1),
            "pct": round(pct, 2),
        }

    suggestions = []
    free_info = breakdown.get("Free", {})
    if free_info.get("pct", 0) > 15:
        suggestions.append(f"[HIGH] Free/Idle 占迭代 {free_info['pct']:.1f}%，存在下发间隙或流同步问题。检查 aclOpCompile / synchronize 调用。")

    data_aug = breakdown.get("Data_aug Bound", {})
    if data_aug.get("pct", 0) > 10:
        suggestions.append(f"[MEDIUM] 数据预处理占 {data_aug['pct']:.1f}%，增大 num_workers / prefetch_factor。")

    comm = breakdown.get("Communication(Not Overlapped)", {})
    if comm.get("pct", 0) > 30:
        suggestions.append(f"[HIGH] 非重叠通信占 {comm['pct']:.1f}%，需优化计算/通信重叠或减少通信量。")

    return {
        "file": str(filepath),
        "step_count": len(steps),
        "total_field": total_field,
        "mean_step_time_us": round(total_mean, 1),
        "breakdown": breakdown,
        "suggestions": suggestions,
    }


# ── Communication Analysis ────────────────────────────────────────────────────

def analyze_communication(filepath):
    """分析 communication_statistic CSV。"""
    dur_candidates = ["Duration(us)", "Duration", "Elapse Time(us)", "Total Duration(us)"]
    size_candidates = ["Size(MB)", "Size", "Transit Size(MB)", "Input Data Size(MB)"]
    type_candidates = ["Op Type", "OP Type", "Operation", "Comm Op Type", "Name"]

    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []

        dur_field = None
        for df in dur_candidates:
            if df in fieldnames:
                dur_field = df
                break
        if not dur_field:
            return None

        size_field = None
        for sf in size_candidates:
            if sf in fieldnames:
                size_field = sf
                break

        type_field = None
        for tf in type_candidates:
            if tf in fieldnames:
                type_field = tf
                break

        rows = []
        for row in reader:
            rows.append(row)

    if not rows:
        return None

    total_time = sum(parse_float(r.get(dur_field, 0)) for r in rows)

    by_type = defaultdict(lambda: {"count": 0, "time": 0.0, "size": 0.0})
    for row in rows:
        op_type = row.get(type_field, "Unknown") if type_field else "Unknown"
        by_type[op_type]["count"] += 1
        by_type[op_type]["time"] += parse_float(row.get(dur_field, 0))
        if size_field:
            by_type[op_type]["size"] += parse_float(row.get(size_field, 0))

    type_stats = []
    for tp, st in sorted(by_type.items(), key=lambda x: x[1]["time"], reverse=True):
        pct = st["time"] / total_time * 100 if total_time > 0 else 0
        # Bandwidth in GB/s: size_MB / (time_us / 1e6) / 1024
        bw = st["size"] / (st["time"] / 1e6) / 1024 if st["time"] > 0 and st["size"] > 0 else 0
        type_stats.append({
            "type": tp,
            "count": st["count"],
            "time_us": round(st["time"], 1),
            "pct": round(pct, 2),
            "size_mb": round(st["size"], 2),
            "bandwidth_gbps": round(bw, 2),
        })

    return {
        "file": str(filepath),
        "total_communications": len(rows),
        "total_time_us": round(total_time, 1),
        "by_type": type_stats,
    }


# ── Communication Shape Analysis (from operator_details.csv) ─────────────────

def _parse_shape_elements(shape_str):
    """从 shape 字符串（如 '4,4860,1,10,128'）计算总元素数。"""
    if not shape_str or shape_str.strip() in ("", "N/A"):
        return 0
    try:
        dims = [int(d.strip()) for d in shape_str.split(",") if d.strip().isdigit()]
        result = 1
        for d in dims:
            result *= d
        return result
    except (ValueError, TypeError):
        return 0


def _read_operator_details_csv(filepath):
    """读取 operator_details.csv，处理多行字段（Input Shapes 可能跨行）。"""
    rows = []
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        if "Name" not in fieldnames:
            return []
        for row in reader:
            rows.append(row)
    return rows


def analyze_comm_from_operator_details(filepath):
    """从 operator_details.csv 提取通信算子的 shape 分组分析。

    筛选 Name 包含 'Hccl' 的行，按 (Name, Input Shapes) 分组，
    计算每组的 count / mean / std / cv / min / max of Device Total Duration(us)。
    """
    rows = _read_operator_details_csv(filepath)
    if not rows:
        return None

    dur_field = "Device Total Duration(us)"
    if dur_field not in (rows[0] if rows else {}):
        # Try alternative
        for candidate in ["Device Self Duration(us)", "Host Total Duration(us)"]:
            if candidate in (rows[0] if rows else {}):
                dur_field = candidate
                break

    # Filter communication ops (Hccl*)
    comm_rows = []
    for row in rows:
        name = row.get("Name", "")
        if "Hccl" in name or "hccl" in name:
            shapes = row.get("Input Shapes", "").strip().strip('"')
            dur = parse_float(row.get(dur_field, 0))
            if dur > 0:
                comm_rows.append({"name": name, "shapes": shapes, "duration": dur})

    if not comm_rows:
        return None

    # Group by (name, shapes)
    shape_groups = defaultdict(list)
    for r in comm_rows:
        key = (r["name"], r["shapes"])
        shape_groups[key].append(r["duration"])

    total_comm_time = sum(r["duration"] for r in comm_rows)

    results = []
    for (name, shapes), durations in shape_groups.items():
        n = len(durations)
        mean = sum(durations) / n
        variance = sum((x - mean) ** 2 for x in durations) / n
        std = math.sqrt(variance)
        cv = std / mean if mean > 0 else 0
        min_d = min(durations)
        max_d = max(durations)
        spread = (max_d - min_d) / mean if mean > 0 else 0
        total = sum(durations)
        pct = total / total_comm_time * 100 if total_comm_time > 0 else 0

        # Estimate tensor size (assume BF16 = 2 bytes)
        elements = _parse_shape_elements(shapes)
        tensor_size_mb = elements * 2 / (1024 * 1024) if elements > 0 else 0

        results.append({
            "name": name,
            "shapes": shapes if shapes else "(empty)",
            "count": n,
            "mean_us": round(mean, 2),
            "std_us": round(std, 2),
            "cv": round(cv, 4),
            "min_us": round(min_d, 2),
            "max_us": round(max_d, 2),
            "spread": round(spread, 4),
            "total_us": round(total, 1),
            "pct": round(pct, 2),
            "tensor_size_mb": round(tensor_size_mb, 2),
        })

    results.sort(key=lambda x: x["total_us"], reverse=True)

    return {
        "file": str(filepath),
        "total_comm_ops": len(comm_rows),
        "total_comm_time_us": round(total_comm_time, 1),
        "shape_groups": results,
    }


def infer_comm_shapes_from_predecessors(rows):
    """从 kernel_details 的行序列中，为通信算子推断 shape。

    对每个 hcom_ 行，取其前一行的 Output Shapes 作为推断 shape。
    返回 dict: hcom 行索引 -> 推断 shape 字符串。
    """
    inferred = {}
    for i, r in enumerate(rows):
        if r.get("category") == "other" and r.get("type", "").startswith("hcom_"):
            if i > 0:
                prev_shapes = rows[i - 1].get("shapes", "")
                prev_type = rows[i - 1].get("type", "")
                if prev_shapes and prev_shapes != "N/A":
                    inferred[i] = f"{prev_shapes} (← {prev_type})"
                else:
                    inferred[i] = ""
    return inferred


# ── Output ────────────────────────────────────────────────────────────────────

def print_text_report(op_results, step_results, comm_results, comm_shape_results=None):
    """打印综合文本报告。"""
    if comm_shape_results is None:
        comm_shape_results = []
    print("=" * 90)
    print("  昇腾 NPU Profiling 综合分析报告")
    print("=" * 90)

    all_suggestions = []

    # Op Summary
    for op in op_results:
        total = op["total_time_us"]
        print(f"\n{'━' * 90}")
        print(f"  算子分析: {op['file']}")
        print(f"  总算子数: {op['total_ops']}，总耗时: {total:.1f} us ({total/1e6:.3f} s)")
        print(f"{'━' * 90}")

        # Cube / Vector ratio
        print(f"\n  ┌─ Cube / Vector / AICPU 分布 ─────────────────────────────────────────┐")
        for cat, label in [("cube", "AI_CORE (Cube)"), ("vector", "AI_VECTOR_CORE"),
                           ("mix", "MIX_AIV"), ("aicpu", "AI_CPU"), ("other", "Other")]:
            info = op["cube_vector"].get(cat, {})
            pct = info.get("pct", 0)
            cnt = info.get("count", 0)
            t = info.get("time_us", 0)
            bar = "█" * int(pct / 2) + "░" * (50 - int(pct / 2))
            print(f"  │ {label:<22s} {bar} {pct:5.1f}% ({cnt} ops, {t:.0f}us)")
        print(f"  └─────────────────────────────────────────────────────────────────────┘")

        # Top ops - check if pipe metrics available
        has_pipe = any(o.get("mac_ratio", 0) > 0 or o.get("vec_ratio", 0) > 0 for o in op["top_ops"])
        print(f"\n  Top-{len(op['top_ops'])} 慢算子:\n")
        if has_pipe:
            print(f"  {'#':>3s}  {'名称':<28s}  {'类型':<14s}  {'耗时(us)':>9s}  {'占比':>5s}  {'累计':>5s}  {'Task':>10s}  {'Mac':>5s} {'Vec':>5s} {'MTE2':>5s}  {'Bound':<7s}  {'Shapes':<20s}")
            print(f"  {'─'*3}  {'─'*28}  {'─'*14}  {'─'*9}  {'─'*5}  {'─'*5}  {'─'*10}  {'─'*5} {'─'*5} {'─'*5}  {'─'*7}  {'─'*20}")
        else:
            print(f"  {'#':>3s}  {'名称':<30s}  {'类型':<16s}  {'耗时(us)':>10s}  {'占比':>6s}  {'累计':>6s}  {'Task':>12s}  {'Shapes':<25s}")
            print(f"  {'─'*3}  {'─'*30}  {'─'*16}  {'─'*10}  {'─'*6}  {'─'*6}  {'─'*12}  {'─'*25}")
        cum = 0.0
        for i, o in enumerate(op["top_ops"], 1):
            cum += o["pct"]
            if has_pipe:
                mac = o.get("mac_ratio", 0)
                vec = o.get("vec_ratio", 0)
                mte2 = o.get("mte2_ratio", 0)
                mac_s = f"{mac:.2f}" if mac > 0 else "  -"
                vec_s = f"{vec:.2f}" if vec > 0 else "  -"
                mte2_s = f"{mte2:.2f}" if mte2 > 0 else "  -"
                bound = o.get("bound", "-")[:7]
                print(f"  {i:3d}  {o['name'][:28]:<28s}  {o['type'][:14]:<14s}  {o['duration_us']:9.1f}  {o['pct']:4.1f}%  {cum:4.1f}%  {o['task_type'][:10]:>10s}  {mac_s:>5s} {vec_s:>5s} {mte2_s:>5s}  {bound:<7s}  {o['shapes'][:20]:<20s}")
            else:
                print(f"  {i:3d}  {o['name'][:30]:<30s}  {o['type'][:16]:<16s}  {o['duration_us']:10.1f}  {o['pct']:5.1f}%  {cum:5.1f}%  {o['task_type'][:12]:>12s}  {o['shapes'][:25]:<25s}")

        # Type breakdown (top 10)
        print(f"\n  按 OP Type 汇总 (Top-10):\n")
        print(f"  {'类型':<28s}  {'次数':>6s}  {'总耗时(us)':>12s}  {'占比':>6s}")
        print(f"  {'─'*28}  {'─'*6}  {'─'*12}  {'─'*6}")
        for tb in op["type_breakdown"][:10]:
            print(f"  {tb['type'][:28]:<28s}  {tb['count']:6d}  {tb['time_us']:12.1f}  {tb['pct']:5.1f}%")

        # Jitter analysis
        jitter = op.get("jitter", [])
        if jitter:
            print(f"\n  ┌─ 同 Shape 算子抖动分析（按 CV 降序）────────────────────────────────┐")
            print(f"  │ {'类型':<22s}  {'核心':<10s} {'次数':>5s}  {'均值(us)':>10s}  {'标准差':>8s}  {'CV':>7s}  {'最小':>10s}  {'最大':>10s}  {'占比':>5s}  {'Shapes':<30s}")
            print(f"  │ {'─'*22}  {'─'*10} {'─'*5}  {'─'*10}  {'─'*8}  {'─'*7}  {'─'*10}  {'─'*10}  {'─'*5}  {'─'*30}")
            for j in jitter[:15]:
                cv_flag = " ⚠" if j["cv"] > 0.05 else ""
                shapes_display = j["shapes"][:30] if j["shapes"] else "N/A"
                if j.get("shapes_inferred"):
                    shapes_display = "≈" + shapes_display[:29]
                print(f"  │ {j['type'][:22]:<22s}  {j['category']:<10s} {j['count']:5d}  {j['mean_us']:10.1f}  {j['std_us']:8.1f}  {j['cv']:6.2%}{cv_flag} {j['min_us']:10.1f}  {j['max_us']:10.1f}  {j['pct']:4.1f}%  {shapes_display:<30s}")
            print(f"  └─────────────────────────────────────────────────────────────────────┘")
            print(f"  注: CV > 5% 标记 ⚠; ≈ 表示从前驱算子推断的 Shape; Cube/Mix 抖动可能由 NPU 降频引起。")

        all_suggestions.extend(op.get("suggestions", []))

    # Step Trace
    for st in step_results:
        print(f"\n{'━' * 90}")
        print(f"  迭代时间分解: {st['file']}")
        print(f"  共 {st['step_count']} 个 step，平均迭代时间: {st['mean_step_time_us']:.1f} us ({st['mean_step_time_us']/1e6:.4f} s)")
        print(f"{'━' * 90}\n")

        for field, info in st["breakdown"].items():
            pct = info["pct"]
            filled = min(int(pct / 2), 50)
            bar = "█" * filled + "░" * (50 - filled)
            print(f"  {field:<35s} {bar} {pct:5.1f}%  (mean={info['mean_us']:.1f}us, std={info['std_us']:.1f})")

        all_suggestions.extend(st.get("suggestions", []))

    # Communication
    for cm in comm_results:
        print(f"\n{'━' * 90}")
        print(f"  通信分析: {cm['file']}")
        print(f"  共 {cm['total_communications']} 次通信，总耗时: {cm['total_time_us']:.1f} us")
        print(f"{'━' * 90}\n")

        for tp in cm["by_type"][:10]:
            bw_str = f"  带宽={tp['bandwidth_gbps']:.1f}GB/s" if tp.get("bandwidth_gbps", 0) > 0 else ""
            print(f"  {tp['type']:<25s}  次数={tp['count']:5d}  耗时={tp['time_us']:12.1f}us ({tp['pct']:5.1f}%)  数据量={tp['size_mb']:.1f}MB{bw_str}")

    # Communication Shape Analysis (from operator_details.csv)
    for cs in comm_shape_results:
        print(f"\n{'━' * 90}")
        print(f"  通信算子 Shape 分析 (operator_details): {cs['file']}")
        print(f"  共 {cs['total_comm_ops']} 次通信算子调用，总耗时: {cs['total_comm_time_us']:.1f} us")
        print(f"{'━' * 90}\n")

        print(f"  {'算子':<20s}  {'Shape':<25s}  {'次数':>5s}  {'均值(us)':>10s}  {'标准差':>8s}  {'CV':>7s}  {'最小':>10s}  {'最大':>10s}  {'占比':>5s}  {'数据量(MB)':>10s}")
        print(f"  {'─'*20}  {'─'*25}  {'─'*5}  {'─'*10}  {'─'*8}  {'─'*7}  {'─'*10}  {'─'*10}  {'─'*5}  {'─'*10}")
        for g in cs["shape_groups"]:
            cv_flag = " ⚠" if g["cv"] > 0.05 else ""
            size_str = f"{g['tensor_size_mb']:.1f}" if g["tensor_size_mb"] > 0 else "  -"
            print(f"  {g['name'][:20]:<20s}  {g['shapes'][:25]:<25s}  {g['count']:5d}  {g['mean_us']:10.1f}  {g['std_us']:8.1f}  {g['cv']:6.2%}{cv_flag} {g['min_us']:10.1f}  {g['max_us']:10.1f}  {g['pct']:4.1f}%  {size_str:>10s}")

        # Generate suggestions for high-jitter communication ops
        high_cv_groups = [g for g in cs["shape_groups"] if g["cv"] > 0.05 and g["shapes"] != "(empty)"]
        same_shape_groups = [g for g in cs["shape_groups"] if g["shapes"] != "(empty)" and g["count"] >= 5]
        if high_cv_groups:
            for g in high_cv_groups[:3]:
                all_suggestions.append(
                    f"[HIGH] 通信抖动: {g['name']}(shape={g['shapes'][:30]}) "
                    f"CV={g['cv']:.2%}, mean={g['mean_us']:.1f}us, "
                    f"min={g['min_us']:.1f}us, max={g['max_us']:.1f}us "
                    f"（共{g['count']}次, 占通信{g['pct']:.1f}%）。"
                    f"同 Shape 通信抖动可能由网络拥塞或 NPU 降频引起。"
                )
        if same_shape_groups and not high_cv_groups:
            # All same-shape groups are stable - good sign
            pass

    # All Suggestions
    if all_suggestions:
        print(f"\n{'━' * 90}")
        print(f"  综合优化建议")
        print(f"{'━' * 90}\n")
        for i, s in enumerate(all_suggestions, 1):
            print(f"  {i}. {s}")
        print()

    print("=" * 90)


def print_json_report(op_results, step_results, comm_results, comm_shape_results=None):
    """输出 JSON 格式报告。"""
    report = {
        "op_analysis": op_results,
        "step_trace": step_results,
        "communication": comm_results,
        "comm_shape_analysis": comm_shape_results or [],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="昇腾 NPU Profiling 综合分析（自动发现 CSV → 生成报告）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("-d", "--dir", required=True, help="Profiling 数据目录")
    parser.add_argument("-n", "--top", type=int, default=20, help="Top-N 算子数（默认 20）")
    parser.add_argument("--json", action="store_true", help="输出 JSON 格式")

    args = parser.parse_args()

    if not os.path.isdir(args.dir):
        print(f"错误: 目录不存在: {args.dir}", file=sys.stderr)
        sys.exit(1)

    # Discover CSV files
    csvs = find_profiling_csvs(args.dir)
    print(f"扫描目录: {args.dir}", file=sys.stderr)
    print(f"  找到 op_summary: {len(csvs['op_summary'])} 个文件", file=sys.stderr)
    print(f"  找到 step_trace: {len(csvs['step_trace'])} 个文件", file=sys.stderr)
    print(f"  找到 communication: {len(csvs['communication'])} 个文件", file=sys.stderr)
    print(f"  找到 operator_details: {len(csvs['operator_details'])} 个文件", file=sys.stderr)

    if not any(csvs.values()):
        print("错误: 未在指定目录中找到任何 profiling CSV 文件。", file=sys.stderr)
        print("提示: 确保已完成 profiling 数据解析（msprof --export=text 或 torch_npu.profiler ExportType.Text）", file=sys.stderr)
        sys.exit(1)

    # Analyze
    op_results = []
    for f in csvs["op_summary"]:
        result = analyze_op_summary(f, top_n=args.top)
        if result:
            op_results.append(result)

    step_results = []
    for f in csvs["step_trace"]:
        result = analyze_step_trace(f)
        if result:
            step_results.append(result)

    comm_results = []
    for f in csvs["communication"]:
        result = analyze_communication(f)
        if result:
            comm_results.append(result)

    comm_shape_results = []
    for f in csvs["operator_details"]:
        result = analyze_comm_from_operator_details(f)
        if result:
            comm_shape_results.append(result)

    # Output
    if args.json:
        print_json_report(op_results, step_results, comm_results, comm_shape_results)
    else:
        print_text_report(op_results, step_results, comm_results, comm_shape_results)


if __name__ == "__main__":
    main()
