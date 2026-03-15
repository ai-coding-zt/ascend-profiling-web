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
    """发现所有关键 CSV 文件。支持多卡：收集所有 step_trace（多卡分析），但 op_summary 只取一个。"""
    op_files = find_csv_files(base_dir, ["kernel_details"])
    if not op_files:
        op_files = find_csv_files(base_dir, ["op_summary"])
    else:
        # Only keep one kernel_details for op analysis (prefer ASCEND_PROFILER_OUTPUT)
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


def _extract_primary_dtype(dtype_str):
    """从分号分隔的 dtype 字符串中取第一个作为主要 dtype。"""
    if not dtype_str or dtype_str.strip() in ("", "N/A"):
        return ""
    parts = [p.strip() for p in dtype_str.split(";") if p.strip()]
    return parts[0] if parts else ""


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

            # Dtype & Format extraction
            input_dtypes = get_field(row, "Input Data Types")
            input_formats = get_field(row, "Input Formats")
            output_dtypes = get_field(row, "Output Data Types")
            primary_dtype = _extract_primary_dtype(input_dtypes)
            primary_format = _extract_primary_dtype(input_formats)

            # Pipeline utilization — all 6 ratio fields
            scalar = parse_float(get_field(row, "aic_scalar_ratio", "Scalar Ratio"))
            mte1 = parse_float(get_field(row, "aic_mte1_ratio", "MTE1 Ratio"))
            mte3 = parse_float(get_field(row, "aic_mte3_ratio", "MTE3 Ratio"))

            # Start time & wait time for dispatch rate analysis
            start_time = parse_float(get_field(row, "Task Start Time(us)", "Start Time(us)"))
            wait_time = parse_float(get_field(row, "Task Wait Time(us)", "Wait Time(us)"))

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
                "dtype": primary_dtype,
                "format": primary_format,
                "input_dtypes": input_dtypes,
                "output_dtypes": output_dtypes,
                "scalar_ratio": scalar,
                "mte1_ratio": mte1,
                "mte3_ratio": mte3,
                "start_time": start_time,
                "wait_time": wait_time,
            })

    total_time = sum(r["duration"] for r in rows)
    total_count = len(rows)

    # ── Dtype Statistics ──
    dtype_count = defaultdict(lambda: {"count": 0, "time": 0.0})
    for r in rows:
        dt = r["dtype"] if r["dtype"] else "Unknown"
        dtype_count[dt]["count"] += 1
        dtype_count[dt]["time"] += r["duration"]

    dtype_stats = {}
    for dt, info in sorted(dtype_count.items(), key=lambda x: x[1]["time"], reverse=True):
        dtype_stats[dt] = {
            "count": info["count"],
            "time_us": round(info["time"], 1),
            "pct_count": round(info["count"] / total_count * 100, 2) if total_count > 0 else 0,
            "pct_time": round(info["time"] / total_time * 100, 2) if total_time > 0 else 0,
        }

    # ── Dtype Analysis (detailed) ──
    dtype_by_count = [{"dtype": dt, "count": info["count"], "pct": info["pct_count"]}
                      for dt, info in dtype_stats.items()]
    dtype_by_count.sort(key=lambda x: x["count"], reverse=True)

    dtype_by_time = [{"dtype": dt, "time_us": info["time_us"], "pct": info["pct_time"]}
                     for dt, info in dtype_stats.items()]
    dtype_by_time.sort(key=lambda x: x["time_us"], reverse=True)

    # Detect type conversions: ops where input dtype != output dtype, or Cast ops
    type_conversions = []
    cast_stats = defaultdict(lambda: {"count": 0, "time": 0.0})
    for r in rows:
        in_dt = _extract_primary_dtype(r["input_dtypes"])
        out_dt = _extract_primary_dtype(r["output_dtypes"])
        if in_dt and out_dt and in_dt != out_dt:
            key = (r["type"], in_dt, out_dt)
            cast_stats[key]["count"] += 1
            cast_stats[key]["time"] += r["duration"]
    for (op_type, from_dt, to_dt), info in sorted(cast_stats.items(), key=lambda x: x[1]["time"], reverse=True):
        type_conversions.append({
            "op_type": op_type,
            "from": from_dt,
            "to": to_dt,
            "count": info["count"],
            "time_us": round(info["time"], 1),
        })

    dtype_analysis = {
        "by_count": dtype_by_count,
        "by_time": dtype_by_time,
        "type_conversions": type_conversions[:20],
    }

    # Top-N: group by (type, shapes) — aggregate same-type same-shape ops
    top_shape_groups = defaultdict(list)
    for r in rows:
        key = (r["type"], r["shapes"])
        top_shape_groups[key].append(r)

    top_groups_list = []
    for (op_type, shapes), group in top_shape_groups.items():
        durations = [r["duration"] for r in group]
        n = len(durations)
        group_total = sum(durations)
        mean = group_total / n
        variance = sum((x - mean) ** 2 for x in durations) / n if n > 1 else 0
        std = math.sqrt(variance)
        cv = std / mean if mean > 0 else 0
        category = group[0]["category"]
        task_type = group[0]["task_type"]
        # Average utilization metrics
        mac = sum(r.get("mac_ratio", 0) for r in group) / n
        vec = sum(r.get("vec_ratio", 0) for r in group) / n
        mte2 = sum(r.get("mte2_ratio", 0) for r in group) / n
        if mac > mte2 and mac > vec and mac > 0:
            bound = "compute"
        elif mte2 > mac and mte2 > vec and mte2 > 0:
            bound = "memory"
        elif vec > 0:
            bound = "vector"
        else:
            bound = "unknown"

        # Dominant dtype/format for the group
        dtype_counts = defaultdict(int)
        format_counts = defaultdict(int)
        for r in group:
            if r["dtype"]:
                dtype_counts[r["dtype"]] += 1
            if r["format"]:
                format_counts[r["format"]] += 1
        dominant_dtype = max(dtype_counts, key=dtype_counts.get) if dtype_counts else ""
        dominant_format = max(format_counts, key=format_counts.get) if format_counts else ""

        top_groups_list.append({
            "type": op_type,
            "shapes": shapes,
            "category": category,
            "task_type": task_type,
            "count": n,
            "total_us": round(group_total, 1),
            "mean_us": round(mean, 2),
            "std_us": round(std, 2),
            "cv": round(cv, 4),
            "min_us": round(min(durations), 2),
            "max_us": round(max(durations), 2),
            "mac_ratio": round(mac, 4),
            "vec_ratio": round(vec, 4),
            "mte2_ratio": round(mte2, 4),
            "bound": bound,
            "dtype": dominant_dtype,
            "format": dominant_format,
        })

    # Sort by total time descending
    top_groups_list.sort(key=lambda x: x["total_us"], reverse=True)
    top_ops = top_groups_list[:top_n]

    # Add pct and cumulative_pct
    cum = 0.0
    for g in top_ops:
        pct = round(g["total_us"] / total_time * 100, 2) if total_time > 0 else 0
        cum += pct
        g["pct"] = pct
        g["cumulative_pct"] = round(cum, 2)

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

    # Type breakdown (expanded to top-30)
    type_stats = defaultdict(lambda: {"count": 0, "time": 0.0})
    for r in rows:
        type_stats[r["type"]]["count"] += 1
        type_stats[r["type"]]["time"] += r["duration"]
    type_breakdown = []
    for tp, st in sorted(type_stats.items(), key=lambda x: x[1]["time"], reverse=True):
        pct = st["time"] / total_time * 100 if total_time > 0 else 0
        type_breakdown.append({"type": tp, "count": st["count"], "time_us": round(st["time"], 1), "pct": round(pct, 2)})

    # ── Pipeline Utilization (top-10 by time) ──
    pipeline_utilization = _compute_pipeline_utilization(top_groups_list[:10], rows)

    # ── Dispatch Rate Analysis ──
    dispatch_rate = _analyze_dispatch_rate(rows)

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
        top5_time = sum(o["total_us"] for o in top_ops[:5])
        top5_pct = top5_time / total_time * 100 if total_time > 0 else 0
        if top5_pct > 50:
            ops_str = "; ".join(f"{o['type']}({o['pct']:.1f}%,x{o['count']})" for o in top_ops[:5])
            suggestions.append(f"[HIGH] Top-5 算子组占总耗时 {top5_pct:.1f}%，优化收益集中。{ops_str}")

    # Vector ratio
    vec_info = cube_vector.get("vector", {})
    if vec_info.get("pct", 0) > 30:
        suggestions.append(f"[MEDIUM] Vector 算子占比 {vec_info['pct']:.1f}%（{vec_info['count']} 个），考虑算子融合减少 Elementwise kernel 数量。")

    # Memory-bound MatMul detection
    mem_matmuls = [o for o in top_ops[:20]
                   if o.get("mte2_ratio", 0) > o.get("mac_ratio", 0) and o.get("mte2_ratio", 0) > 0.5
                   and "MatMul" in o["type"]]
    if mem_matmuls:
        detail = "; ".join(f"{o['type']}(mte2={o['mte2_ratio']:.2f},x{o['count']}) shapes={o['shapes'][:30]}" for o in mem_matmuls[:3])
        suggestions.append(f"[HIGH] {len(mem_matmuls)} 组 Top MatMul 算子为搬运受限。{detail}。建议优化数据布局、Shape 对齐到 16 的倍数。")

    # Low-utilization vector ops
    low_vec = [o for o in top_ops[:20]
               if 0 < o.get("vec_ratio", 0) < 0.1 and o["category"] == "vector"]
    if low_vec:
        types = ", ".join(set(o["type"] for o in low_vec[:5]))
        suggestions.append(f"[MEDIUM] {len(low_vec)} 组 Top Vector 算子利用率 < 10%（{types}），可能是纯数据转换，检查是否可消除或融合。")

    # ── Jitter / 抖动 Analysis ──
    inferred_shapes = infer_comm_shapes_from_predecessors(rows)
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

        # Dominant dtype for jitter group
        jitter_dtype_counts = defaultdict(int)
        for r in group:
            if r.get("dtype"):
                jitter_dtype_counts[r["dtype"]] += 1
        jitter_dtype = max(jitter_dtype_counts, key=jitter_dtype_counts.get) if jitter_dtype_counts else ""

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
            "dtype": jitter_dtype,
        })

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

    return {
        "file": str(filepath),
        "total_ops": total_count,
        "total_time_us": round(total_time, 1),
        "duration_field": dur_field,
        "cube_vector": cube_vector,
        "top_ops": top_ops,
        "type_breakdown": type_breakdown[:30],
        "jitter": jitter_results[:20],
        "suggestions": suggestions,
        "dtype_stats": dtype_stats,
        "dtype_analysis": dtype_analysis,
        "pipeline_utilization": pipeline_utilization,
        "dispatch_rate": dispatch_rate,
    }


# ── Pipeline Utilization ─────────────────────────────────────────────────────

def _compute_pipeline_utilization(top_groups, all_rows):
    """计算 top 算子组的流水线利用率。"""
    # Build per-group utilization from raw rows
    group_index = defaultdict(list)
    for r in all_rows:
        key = (r["type"], r["shapes"])
        group_index[key].append(r)

    top_ops = []
    for g in top_groups:
        key = (g["type"], g["shapes"])
        members = group_index.get(key, [])
        n = len(members) if members else 1
        mac = sum(r.get("mac_ratio", 0) for r in members) / n
        vec = sum(r.get("vec_ratio", 0) for r in members) / n
        scalar = sum(r.get("scalar_ratio", 0) for r in members) / n
        mte1 = sum(r.get("mte1_ratio", 0) for r in members) / n
        mte2 = sum(r.get("mte2_ratio", 0) for r in members) / n
        mte3 = sum(r.get("mte3_ratio", 0) for r in members) / n
        cube_util = sum(r.get("cube_util", 0) for r in members) / n

        # Only include if any utilization data exists
        if mac > 0 or vec > 0 or scalar > 0 or mte1 > 0 or mte2 > 0 or mte3 > 0:
            top_ops.append({
                "type": g["type"],
                "shapes": g["shapes"][:60],
                "dtype": g.get("dtype", ""),
                "mac_ratio": round(mac, 4),
                "vec_ratio": round(vec, 4),
                "scalar_ratio": round(scalar, 4),
                "mte1_ratio": round(mte1, 4),
                "mte2_ratio": round(mte2, 4),
                "mte3_ratio": round(mte3, 4),
                "cube_util": round(cube_util, 2),
            })

    # Average utilization across all ops with data
    ops_with_data = [r for r in all_rows if r.get("mac_ratio", 0) > 0 or r.get("vec_ratio", 0) > 0]
    n_total = len(ops_with_data) if ops_with_data else 1
    avg = {
        "mac": round(sum(r.get("mac_ratio", 0) for r in ops_with_data) / n_total, 4),
        "vec": round(sum(r.get("vec_ratio", 0) for r in ops_with_data) / n_total, 4),
        "scalar": round(sum(r.get("scalar_ratio", 0) for r in ops_with_data) / n_total, 4),
        "mte1": round(sum(r.get("mte1_ratio", 0) for r in ops_with_data) / n_total, 4),
        "mte2": round(sum(r.get("mte2_ratio", 0) for r in ops_with_data) / n_total, 4),
        "mte3": round(sum(r.get("mte3_ratio", 0) for r in ops_with_data) / n_total, 4),
    }

    return {
        "top_ops": top_ops,
        "avg_utilization": avg,
    }


# ── Dispatch Rate Analysis ───────────────────────────────────────────────────

def _analyze_dispatch_rate(rows):
    """分析算子下发速率。"""
    # Filter rows with valid start time
    timed_rows = [r for r in rows if r.get("start_time", 0) > 0]
    if len(timed_rows) < 10:
        return None

    timed_rows.sort(key=lambda x: x["start_time"])
    total_ops = len(timed_rows)
    first_time = timed_rows[0]["start_time"]
    last_time = timed_rows[-1]["start_time"]
    total_duration = last_time - first_time
    if total_duration <= 0:
        return None

    avg_rate = total_ops / (total_duration / 1e6) if total_duration > 0 else 0

    # Window-based analysis (1000 ops per window)
    window_size = 1000
    windows = []
    bottleneck_windows = []
    # Compute overall mean gap for threshold
    all_gaps = []
    for i in range(1, len(timed_rows)):
        gap = timed_rows[i]["start_time"] - timed_rows[i - 1]["start_time"]
        if gap >= 0:
            all_gaps.append(gap)
    overall_mean_gap = sum(all_gaps) / len(all_gaps) if all_gaps else 0
    gap_threshold = overall_mean_gap * 3  # 3x mean gap = bottleneck

    for w_start in range(0, total_ops, window_size):
        w_end = min(w_start + window_size, total_ops)
        window_rows = timed_rows[w_start:w_end]
        if len(window_rows) < 2:
            continue
        w_first = window_rows[0]["start_time"]
        w_last = window_rows[-1]["start_time"]
        w_span = w_last - w_first
        if w_span <= 0:
            continue
        w_ops = len(window_rows)
        w_rate = w_ops / (w_span / 1e6)
        # Mean gap in this window
        w_gaps = []
        for i in range(1, len(window_rows)):
            g = window_rows[i]["start_time"] - window_rows[i - 1]["start_time"]
            if g >= 0:
                w_gaps.append(g)
        w_mean_gap = sum(w_gaps) / len(w_gaps) if w_gaps else 0
        # Mean wait time
        w_mean_wait = sum(r.get("wait_time", 0) for r in window_rows) / w_ops

        w_idx = w_start // window_size
        windows.append({
            "start_us": round(w_first, 1),
            "end_us": round(w_last, 1),
            "ops": w_ops,
            "rate": round(w_rate, 1),
            "mean_gap_us": round(w_mean_gap, 2),
            "mean_wait_us": round(w_mean_wait, 2),
        })
        if w_mean_gap > gap_threshold and gap_threshold > 0:
            bottleneck_windows.append(w_idx)

    # Wait time distribution
    wait_times = [r.get("wait_time", 0) for r in timed_rows]
    wait_dist = {"0-1us": 0, "1-10us": 0, "10-100us": 0, ">100us": 0}
    for wt in wait_times:
        if wt <= 1:
            wait_dist["0-1us"] += 1
        elif wt <= 10:
            wait_dist["1-10us"] += 1
        elif wt <= 100:
            wait_dist["10-100us"] += 1
        else:
            wait_dist[">100us"] += 1

    return {
        "total_ops": total_ops,
        "total_duration_us": round(total_duration, 1),
        "avg_rate_ops_per_s": round(avg_rate, 1),
        "windows": windows,
        "wait_time_dist": wait_dist,
        "bottleneck_windows": bottleneck_windows,
    }


# ── Step Trace Analysis ───────────────────────────────────────────────────────

STEP_FIELDS = ["Duration", "Computing", "Communication(Not Overlapped)", "Communication",
               "Overlapped", "Free", "Stage", "Data_aug Bound", "Iteration Refresh",
               "FP_BP Time", "Reduce", "Bubble", "Preparing"]

def analyze_step_trace(filepath):
    """分析 step_trace CSV。"""
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        available = [col for col in STEP_FIELDS if col in fieldnames]
        if not available:
            return None

        has_device_id = "Device_id" in fieldnames

        steps = []
        for row in reader:
            step = {}
            for field in available:
                step[field] = parse_float(row.get(field, 0))
            if has_device_id:
                step["device_id"] = row.get("Device_id", "").strip()
            steps.append(step)

    if not steps:
        return None

    if "Stage" in available:
        total_field = "Stage"
    elif "Duration" in available:
        total_field = "Duration"
    else:
        total_field = available[0]

    total_mean = sum(s.get(total_field, 0) for s in steps) / len(steps) if steps else 0

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

    # ── Overlap Analysis ──
    overlap_analysis = None
    overlapped_info = breakdown.get("Overlapped", {})
    comm_not_overlapped_info = breakdown.get("Communication(Not Overlapped)", {})
    if overlapped_info and comm_not_overlapped_info:
        overlapped_mean = overlapped_info.get("mean_us", 0)
        not_overlapped_mean = comm_not_overlapped_info.get("mean_us", 0)
        comm_total = overlapped_mean + not_overlapped_mean
        if comm_total > 0:
            overlap_ratio = overlapped_mean / comm_total * 100

            # Per-step overlap ratios
            per_step = []
            for i, s in enumerate(steps):
                s_overlap = s.get("Overlapped", 0)
                s_not_overlap = s.get("Communication(Not Overlapped)", 0)
                s_total = s_overlap + s_not_overlap
                s_ratio = s_overlap / s_total * 100 if s_total > 0 else 0
                per_step.append({"step": i + 1, "ratio": round(s_ratio, 2)})

            overlap_analysis = {
                "overlap_ratio": round(overlap_ratio, 2),
                "target": 80,
                "comm_total_us": round(comm_total, 1),
                "overlapped_us": round(overlapped_mean, 1),
                "not_overlapped_us": round(not_overlapped_mean, 1),
                "per_step": per_step,
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

    # Extract device_id if present
    device_id = None
    if has_device_id and steps:
        device_id = steps[0].get("device_id")

    result = {
        "file": str(filepath),
        "step_count": len(steps),
        "total_field": total_field,
        "mean_step_time_us": round(total_mean, 1),
        "breakdown": breakdown,
        "suggestions": suggestions,
    }
    if overlap_analysis:
        result["overlap_analysis"] = overlap_analysis
    if device_id is not None:
        result["device_id"] = device_id
    return result


# ── Multi-Rank Analysis ──────────────────────────────────────────────────────

def analyze_multi_rank(step_trace_results, comm_results=None):
    """分析多卡数据，对比不同 device 的迭代时间。

    快慢卡判断原则（参照 ascend-profiling-analyze SKILL.md 原则 2）：
    - 看各卡的 Comm 占比差异，而非 Stage 总时间
    - 快卡：Computing 占比高、Comm 占比低 — 算得快，到同步点后等待少
    - 慢卡：Computing 占比低、Comm 占比高 — 被通信等待拖住
    - Comm 占比差异超过 1.5 倍即可判定为快慢卡现象

    但同时还需做根因分析：
    - 如果 computing 时间有显著差异，且与 comm 时间呈负相关（computing 长的卡 comm 短），
      说明是 AllReduce 等待模式 — 计算慢的卡是瓶颈，计算快的卡因等待而 comm 时间长。
    - 此时 bottleneck_ranks = 计算时间最长的卡（真正需要优化的目标）。
    """
    # Group by device_id
    by_device = {}
    for st in step_trace_results:
        dev_id = st.get("device_id")
        if dev_id is not None:
            by_device[dev_id] = st

    if len(by_device) <= 1:
        return None

    ranks = []
    for dev_id, st in sorted(by_device.items()):
        bd = st.get("breakdown", {})
        ranks.append({
            "device_id": dev_id,
            "total_us": st.get("mean_step_time_us", 0),
            "computing_us": bd.get("Computing", {}).get("mean_us", 0),
            "comm_us": bd.get("Communication(Not Overlapped)", {}).get("mean_us", 0),
            "free_us": bd.get("Free", {}).get("mean_us", 0),
            "overlapped_us": bd.get("Overlapped", {}).get("mean_us", 0),
        })

    totals = [r["total_us"] for r in ranks]
    mean_total = sum(totals) / len(totals) if totals else 0
    max_dev = max(abs(t - mean_total) / mean_total * 100 for t in totals) if mean_total > 0 else 0

    # ── Per-rank ratios (Comm占比 is the primary metric) ──
    for r in ranks:
        t = r["total_us"]
        if t > 0:
            r["comp_pct"] = round(r["computing_us"] / t * 100, 1)
            r["comm_pct"] = round(r["comm_us"] / t * 100, 1)
            r["free_pct"] = round(r["free_us"] / t * 100, 1)
        else:
            r["comp_pct"] = r["comm_pct"] = r["free_pct"] = 0.0

    # ── Fast/Slow card detection via Comm占比 (SKILL.md 原则2) ──
    comm_pcts = [r["comm_pct"] for r in ranks]
    min_comm_pct = min(comm_pcts) if comm_pcts else 0
    max_comm_pct = max(comm_pcts) if comm_pcts else 0
    comm_ratio = max_comm_pct / min_comm_pct if min_comm_pct > 0 else 0
    has_fast_slow = comm_ratio >= 1.5  # Comm占比差异超过1.5倍

    mean_comm_pct = sum(comm_pcts) / len(comm_pcts) if comm_pcts else 0
    # 慢卡 = Comm占比高于均值的卡 (waiting cards)
    # 快卡 = Comm占比低于均值的卡 (computing bottleneck — the root cause)
    slow_ranks = []
    fast_ranks = []
    if has_fast_slow:
        for r in ranks:
            if r["comm_pct"] > mean_comm_pct * 1.15:
                slow_ranks.append(r["device_id"])
            elif r["comm_pct"] < mean_comm_pct * 0.85:
                fast_ranks.append(r["device_id"])

    # ── Root cause: computing bottleneck detection ──
    # If computing time varies significantly AND negatively correlates with comm time,
    # the cards with longest computing are the actual bottleneck (AllReduce wait pattern).
    comp_vals = [r["computing_us"] for r in ranks]
    comm_vals = [r["comm_us"] for r in ranks]
    mean_comp = sum(comp_vals) / len(comp_vals) if comp_vals else 0
    mean_comm = sum(comm_vals) / len(comm_vals) if comm_vals else 0
    comp_spread = (max(comp_vals) - min(comp_vals)) / mean_comp * 100 if mean_comp > 0 else 0

    # Check negative correlation between computing and communication
    # (cards with higher computing tend to have lower communication = AllReduce wait)
    neg_corr = False
    bottleneck_ranks = []
    if len(ranks) >= 2 and mean_comp > 0 and mean_comm > 0:
        # Simple: check if the card(s) with max computing have min-ish communication
        comp_order = sorted(ranks, key=lambda r: r["computing_us"], reverse=True)
        comm_order = sorted(ranks, key=lambda r: r["comm_us"], reverse=True)
        # If top computing cards are in bottom half of comm, it's negative correlation
        top_comp_ids = set(r["device_id"] for r in comp_order[:len(ranks) // 2])
        top_comm_ids = set(r["device_id"] for r in comm_order[:len(ranks) // 2])
        overlap = top_comp_ids & top_comm_ids
        if len(overlap) == 0 and comp_spread > 2:
            # Pure negative correlation: high computing ↔ low communication
            neg_corr = True
            # Bottleneck = cards with computing above mean (they hold up AllReduce)
            bottleneck_ranks = [r["device_id"] for r in ranks
                                if r["computing_us"] > mean_comp * 1.005]

    # ── Phase comparison stats ──
    phases = ["computing_us", "comm_us", "free_us", "overlapped_us"]
    phase_labels = {"computing_us": "Computing", "comm_us": "Communication",
                    "free_us": "Free", "overlapped_us": "Overlapped"}
    phase_comparison = {}
    phase_imbalances = []

    for phase in phases:
        vals = [r[phase] for r in ranks]
        n = len(vals)
        mean_val = sum(vals) / n
        variance = sum((x - mean_val) ** 2 for x in vals) / n if n > 1 else 0
        std = math.sqrt(variance)
        cv = std / mean_val if mean_val > 0 else 0
        min_val = min(vals) if vals else 0
        max_val = max(vals) if vals else 0

        phase_comparison[phase_labels[phase]] = {
            "mean": round(mean_val, 1),
            "std": round(std, 1),
            "cv": round(cv, 4),
            "min": round(min_val, 1),
            "max": round(max_val, 1),
        }

        if mean_val > 0 and mean_total > 0:
            phase_pct_of_total = mean_val / mean_total * 100
            spread_pct = (max_val - min_val) / mean_val * 100 if mean_val > 0 else 0

            if spread_pct > 20 and phase_pct_of_total > 3:
                high_devs = [r["device_id"] for r in ranks if r[phase] > mean_val * 1.10]
                low_devs = [r["device_id"] for r in ranks if r[phase] < mean_val * 0.90]
                phase_imbalances.append({
                    "phase": phase_labels[phase],
                    "spread_pct": round(spread_pct, 1),
                    "mean_us": round(mean_val, 1),
                    "min_us": round(min_val, 1),
                    "max_us": round(max_val, 1),
                    "high_devices": high_devs,
                    "low_devices": low_devs,
                    "phase_pct_of_total": round(phase_pct_of_total, 1),
                })

    # ── Detect dominant collective op type from communication data ──
    dominant_collective = "allreduce"  # default assumption
    if comm_results:
        # Aggregate by_type across all ranks to find the dominant collective
        collective_times = {}
        for cr in comm_results:
            for bt in cr.get("by_type", []):
                op = bt["type"].lower()
                collective_times[op] = collective_times.get(op, 0) + bt["time_us"]
        if collective_times:
            top_op = max(collective_times, key=collective_times.get)
            if "alltoall" in top_op:
                dominant_collective = "alltoall"
            elif "allgather" in top_op:
                dominant_collective = "allgather"
            elif "reducescatter" in top_op or "reduce_scatter" in top_op:
                dominant_collective = "reduce_scatter"
            elif "allreduce" in top_op:
                dominant_collective = "allreduce"
            else:
                dominant_collective = top_op.replace("hcom_", "").rstrip("_")

    # Determine root cause pattern
    root_cause = None
    if neg_corr and bottleneck_ranks and has_fast_slow:
        root_cause = f"{dominant_collective}_wait"  # Computing imbalance → collective wait pattern
    elif has_fast_slow:
        root_cause = "comm_imbalance"  # Communication issue (topology, bandwidth)

    return {
        "rank_count": len(ranks),
        "ranks": ranks,
        "mean_total_us": round(mean_total, 1),
        "max_deviation_pct": round(max_dev, 3),
        # 慢卡/快卡 (by Comm占比)
        "slow_ranks": slow_ranks,
        "fast_ranks": fast_ranks,
        "has_fast_slow": has_fast_slow,
        "comm_pct_ratio": round(comm_ratio, 2),
        # Root cause
        "root_cause": root_cause,
        "dominant_collective": dominant_collective,
        "bottleneck_ranks": bottleneck_ranks,  # Computing bottleneck cards
        "comp_spread_pct": round(comp_spread, 1),
        # Phase stats
        "phase_comparison": phase_comparison,
        "phase_imbalances": phase_imbalances,
    }


# ── Communication Analysis ────────────────────────────────────────────────────

def analyze_communication(filepath):
    """分析 communication_statistic CSV。"""
    dur_candidates = ["Duration(us)", "Duration", "Total Time(us)", "Elapse Time(us)", "Total Duration(us)"]
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
    """从 operator_details.csv 提取通信算子的 shape 分组分析。"""
    rows = _read_operator_details_csv(filepath)
    if not rows:
        return None

    dur_field = "Device Total Duration(us)"
    if dur_field not in (rows[0] if rows else {}):
        for candidate in ["Device Self Duration(us)", "Host Total Duration(us)"]:
            if candidate in (rows[0] if rows else {}):
                dur_field = candidate
                break

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
    """从 kernel_details 的行序列中，为通信算子推断 shape。"""
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

def print_text_report(op_results, step_results, comm_results, comm_shape_results=None, multi_rank=None):
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

        # Dtype stats
        dtype_stats = op.get("dtype_stats", {})
        if dtype_stats:
            top_dtypes = sorted(dtype_stats.items(), key=lambda x: x[1]["pct_time"], reverse=True)[:5]
            dtype_str = " | ".join(f"{dt} {info['pct_time']:.0f}%" for dt, info in top_dtypes)
            print(f"\n  数据类型: {dtype_str}")

        # Top ops (grouped by type+shapes)
        print(f"\n  Top-{len(op['top_ops'])} 慢算子组（按 Type+Shape 聚合）:\n")
        print(f"  {'#':>3s}  {'类型':<22s}  {'核心':<8s} {'次数':>5s}  {'总耗时(us)':>12s}  {'均值(us)':>10s}  {'占比':>5s}  {'累计':>5s}  {'CV':>7s}  {'Bound':<7s}  {'Dtype':<12s} {'Shapes':<25s}")
        print(f"  {'─'*3}  {'─'*22}  {'─'*8} {'─'*5}  {'─'*12}  {'─'*10}  {'─'*5}  {'─'*5}  {'─'*7}  {'─'*7}  {'─'*12} {'─'*25}")
        for i, o in enumerate(op["top_ops"], 1):
            cv_flag = " ⚠" if o.get("cv", 0) > 0.05 else ""
            bound = o.get("bound", "-")[:7]
            dtype = o.get("dtype", "-")[:12]
            print(f"  {i:3d}  {o['type'][:22]:<22s}  {o['category']:<8s} {o['count']:5d}  {o['total_us']:12.1f}  {o['mean_us']:10.1f}  {o['pct']:4.1f}%  {o['cumulative_pct']:4.1f}%  {o['cv']:6.2%}{cv_flag} {bound:<7s}  {dtype:<12s} {o['shapes'][:25]:<25s}")

        # Type breakdown (top 15)
        print(f"\n  按 OP Type 汇总 (Top-15):\n")
        print(f"  {'类型':<28s}  {'次数':>6s}  {'总耗时(us)':>12s}  {'占比':>6s}")
        print(f"  {'─'*28}  {'─'*6}  {'─'*12}  {'─'*6}")
        for tb in op["type_breakdown"][:15]:
            print(f"  {tb['type'][:28]:<28s}  {tb['count']:6d}  {tb['time_us']:12.1f}  {tb['pct']:5.1f}%")

        # Jitter analysis
        jitter = op.get("jitter", [])
        if jitter:
            print(f"\n  ┌─ 同 Shape 算子抖动分析（按 CV 降序）────────────────────────────────┐")
            print(f"  │ {'类型':<22s}  {'核心':<10s} {'Dtype':<10s} {'次数':>5s}  {'均值(us)':>10s}  {'标准差':>8s}  {'CV':>7s}  {'最小':>10s}  {'最大':>10s}  {'占比':>5s}  {'Shapes':<30s}")
            print(f"  │ {'─'*22}  {'─'*10} {'─'*10} {'─'*5}  {'─'*10}  {'─'*8}  {'─'*7}  {'─'*10}  {'─'*10}  {'─'*5}  {'─'*30}")
            for j in jitter[:15]:
                cv_flag = " ⚠" if j["cv"] > 0.05 else ""
                shapes_display = j["shapes"][:30] if j["shapes"] else "N/A"
                if j.get("shapes_inferred"):
                    shapes_display = "≈" + shapes_display[:29]
                dtype_d = j.get("dtype", "-")[:10]
                print(f"  │ {j['type'][:22]:<22s}  {j['category']:<10s} {dtype_d:<10s} {j['count']:5d}  {j['mean_us']:10.1f}  {j['std_us']:8.1f}  {j['cv']:6.2%}{cv_flag} {j['min_us']:10.1f}  {j['max_us']:10.1f}  {j['pct']:4.1f}%  {shapes_display:<30s}")
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

        # Overlap analysis
        oa = st.get("overlap_analysis")
        if oa:
            status = "✓ 良好" if oa["overlap_ratio"] >= 80 else ("⚠ 需改善" if oa["overlap_ratio"] >= 50 else "✗ 不足")
            print(f"\n  计算-通信重叠率: {oa['overlap_ratio']:.1f}% ({status}, 目标 ≥ {oa['target']}%)")

        all_suggestions.extend(st.get("suggestions", []))

    # Multi-rank analysis
    if multi_rank and multi_rank["rank_count"] > 1:
        print(f"\n{'━' * 90}")
        print(f"  多卡分析: {multi_rank['rank_count']} 张卡")
        print(f"{'━' * 90}\n")
        print(f"  平均迭代时间: {multi_rank['mean_total_us']:.1f} us, 最大偏差: {multi_rank['max_deviation_pct']:.2f}%")
        if multi_rank["slow_ranks"]:
            print(f"  慢卡: {', '.join(str(r) for r in multi_rank['slow_ranks'])}")

    # Communication
    for cm in comm_results:
        print(f"\n{'━' * 90}")
        print(f"  通信分析: {cm['file']}")
        print(f"  共 {cm['total_communications']} 次通信，总耗时: {cm['total_time_us']:.1f} us")
        print(f"{'━' * 90}\n")

        for tp in cm["by_type"][:10]:
            bw_str = f"  带宽={tp['bandwidth_gbps']:.1f}GB/s" if tp.get("bandwidth_gbps", 0) > 0 else ""
            print(f"  {tp['type']:<25s}  次数={tp['count']:5d}  耗时={tp['time_us']:12.1f}us ({tp['pct']:5.1f}%)  数据量={tp['size_mb']:.1f}MB{bw_str}")

    # Communication Shape Analysis
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

        high_cv_groups = [g for g in cs["shape_groups"] if g["cv"] > 0.05 and g["shapes"] != "(empty)"]
        if high_cv_groups:
            for g in high_cv_groups[:3]:
                all_suggestions.append(
                    f"[HIGH] 通信抖动: {g['name']}(shape={g['shapes'][:30]}) "
                    f"CV={g['cv']:.2%}, mean={g['mean_us']:.1f}us, "
                    f"min={g['min_us']:.1f}us, max={g['max_us']:.1f}us "
                    f"（共{g['count']}次, 占通信{g['pct']:.1f}%）。"
                    f"同 Shape 通信抖动可能由网络拥塞或 NPU 降频引起。"
                )

    # All Suggestions
    if all_suggestions:
        print(f"\n{'━' * 90}")
        print(f"  综合优化建议")
        print(f"{'━' * 90}\n")
        for i, s in enumerate(all_suggestions, 1):
            print(f"  {i}. {s}")
        print()

    print("=" * 90)


def print_json_report(op_results, step_results, comm_results, comm_shape_results=None, multi_rank=None, repeated_structures=None):
    """输出 JSON 格式报告。"""
    report = {
        "op_analysis": op_results,
        "step_trace": step_results,
        "communication": comm_results,
        "comm_shape_analysis": comm_shape_results or [],
    }
    if multi_rank:
        report["multi_rank"] = multi_rank
    if repeated_structures:
        report["repeated_structures"] = repeated_structures
    print(json.dumps(report, ensure_ascii=False, indent=2))


# ── Repeated Structure Detection ──────────────────────────────────────────────

def detect_repeated_structures(kernel_details_path, step_id="1"):
    """从 kernel_details.csv 的算子序列中检测重复结构（如 DiT layers, VAE ResBlocks）。

    算法：
    1. 读取指定 step 的算子序列
    2. 对每种算子类型，计算 every-Nth 出现的间距
    3. 找到间距一致的锚点算子 + 步长组合
    4. 以锚点为界，提取完整的重复块
    5. 验证块结构一致性，输出单层算子列表
    """
    try:
        with open(kernel_details_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = []
            for row in reader:
                sid = row.get("Step Id", "")
                if sid != step_id:
                    continue
                rows.append(row)
    except Exception:
        return []

    if len(rows) < 20:
        return []

    types = [r.get("Type", "") for r in rows]
    n = len(types)

    # ── Index all op types ──
    from collections import Counter
    type_indices = {}
    for i, t in enumerate(types):
        type_indices.setdefault(t, []).append(i)

    # ── Find anchor candidates with consistent period ──
    # For each type, try stride=1 (every occurrence) and stride=2..4 (every Nth)
    # This catches e.g. AdaLayerNormV2 which appears 2× per DiT block (stride=2 → block period)
    candidates = []
    for t, indices in type_indices.items():
        if len(indices) < 4:
            continue
        for stride in [1, 2, 3, 4]:
            if len(indices) < stride * 3:
                continue
            # Take every Nth occurrence
            sampled = indices[::stride]
            if len(sampled) < 3:
                continue
            gaps = [sampled[i + 1] - sampled[i] for i in range(len(sampled) - 1)]
            gap_counts = Counter(gaps)
            mode_gap, mode_count = gap_counts.most_common(1)[0]
            consistency = mode_count / len(gaps)

            if consistency >= 0.6 and mode_gap >= 8:
                layer_count = mode_count + 1
                if layer_count < 3:
                    continue
                candidates.append({
                    "anchor_type": t,
                    "stride": stride,
                    "gap": mode_gap,
                    "consistency": consistency,
                    "layer_count": layer_count,
                    "sampled_indices": sampled,
                })

    if not candidates:
        return []

    # Prefer: larger gap (bigger blocks), then higher consistency
    candidates.sort(key=lambda c: (-c["gap"] * c["layer_count"], -c["consistency"]))

    # ── Deduplicate: if two candidates cover similar range, keep the bigger one ──
    selected = []
    used_ranges = set()

    for cand in candidates:
        indices = cand["sampled_indices"]
        gap = cand["gap"]

        # Find the LONGEST chain of consecutive indices with the exact gap
        best_chain = []
        curr_chain = [indices[0]]
        for i in range(1, len(indices)):
            if indices[i] - curr_chain[-1] == gap:
                curr_chain.append(indices[i])
            else:
                if len(curr_chain) > len(best_chain):
                    best_chain = curr_chain[:]
                curr_chain = [indices[i]]
        if len(curr_chain) > len(best_chain):
            best_chain = curr_chain[:]
        chain = best_chain

        if len(chain) < 3:
            continue

        # Check overlap with already-detected structures
        sample_start = chain[0]
        sample_end = min(chain[0] + gap, n)
        if any(i in used_ranges for i in range(sample_start, sample_end)):
            continue

        # Extract one block
        block_start = chain[0]
        block_end = min(chain[1], n)
        block_types = types[block_start:block_end]

        # Verify: check that subsequent blocks match
        match_count = 0
        for k in range(len(chain) - 1):
            s = chain[k]
            e = min(chain[k + 1], n)
            chunk = types[s:e]
            if chunk == block_types:
                match_count += 1

        total_checks = len(chain) - 1
        if total_checks < 2:
            continue
        match_pct = match_count / total_checks * 100

        if match_pct < 60:
            continue

        # ── Build per-layer op list ──
        layer_ops = []
        total_layer_time = 0.0
        for offset in range(block_end - block_start):
            r = rows[block_start + offset]
            dur = parse_float(r.get("Duration(us)", 0))
            total_layer_time += dur
            layer_ops.append({
                "idx": offset,
                "type": r.get("Type", ""),
                "name": (r.get("Name", "") or "")[:80],
                "duration_us": round(dur, 1),
                "accelerator": r.get("Accelerator Core", r.get("Task Type", "")),
            })

        # Compute aggregate time over all layers
        total_structure_time = 0.0
        for k in range(len(chain)):
            s = chain[k]
            e = min(s + gap, n)
            for offset in range(min(e - s, gap)):
                if s + offset < n:
                    total_structure_time += parse_float(rows[s + offset].get("Duration(us)", 0))

        # Classify structure type
        op_set = set(block_types)
        if "FlashAttentionScore" in op_set or "FusedInferAttentionScore" in op_set:
            struct_type = "Transformer"
        elif "Conv3DV2" in op_set or "Conv2DV2" in op_set:
            struct_type = "ConvBlock"
        else:
            struct_type = "Repeated"

        if struct_type == "Transformer":
            if "AdaLayerNormV2" in op_set:
                struct_name = "DiT Block"
            elif "LayerNormV4" in op_set or "RmsNorm" in op_set:
                struct_name = "Transformer Block"
            else:
                struct_name = "Attention Block"
        elif struct_type == "ConvBlock":
            if "Swish" in op_set or "Gelu" in op_set:
                struct_name = "VAE ResBlock"
            else:
                struct_name = "Conv Block"
        else:
            struct_name = f"Repeated ({cand['anchor_type']})"

        structures_entry = {
            "name": struct_name,
            "type": struct_type,
            "anchor_op": cand["anchor_type"],
            "layer_count": len(chain),
            "ops_per_layer": len(layer_ops),
            "single_layer_time_us": round(total_layer_time, 1),
            "total_time_us": round(total_structure_time, 1),
            "match_pct": round(match_pct, 1),
            "layer_ops": layer_ops,
        }
        selected.append(structures_entry)

        # Mark range as used
        for i in range(chain[0], min(chain[-1] + gap, n)):
            used_ranges.add(i)

    # Sort by total time (most impactful first)
    selected.sort(key=lambda s: -s["total_time_us"])

    # Filter out sub-patterns and duplicates
    if len(selected) > 1:
        filtered = []
        for s in selected:
            is_redundant = False
            for other in filtered:
                # Sub-pattern: much smaller ops per layer, lower total time
                if (other["ops_per_layer"] > s["ops_per_layer"] * 3 and
                        other["total_time_us"] > s["total_time_us"] * 2):
                    is_redundant = True
                    break
                # Overlap: similar total time but one is a grouping of the other
                # (e.g., 453-op block = 3 × 151-op DiT blocks)
                if (abs(other["total_time_us"] - s["total_time_us"]) / max(other["total_time_us"], 1) < 0.15
                        and other["type"] == s["type"]):
                    # Keep the one with more layers (finer granularity)
                    if other["layer_count"] >= s["layer_count"]:
                        is_redundant = True
                    else:
                        # Replace the coarser structure with the finer one
                        filtered.remove(other)
                    break
            if not is_redundant:
                filtered.append(s)
        selected = filtered

    return selected


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

    # Multi-rank analysis
    multi_rank = analyze_multi_rank(step_results, comm_results)

    # Repeated structure detection (from kernel_details.csv)
    repeated_structures = []
    kernel_files = find_csv_files(args.dir, ["kernel_details"])
    if kernel_files:
        # Use the first kernel_details (prefer ASCEND_PROFILER_OUTPUT)
        ascend_kf = [f for f in kernel_files if "ASCEND_PROFILER_OUTPUT" in str(f)]
        kf = (ascend_kf or kernel_files)[0]
        repeated_structures = detect_repeated_structures(str(kf))
        if repeated_structures:
            print(f"  检测到 {len(repeated_structures)} 个重复结构", file=sys.stderr)

    # Output
    if args.json:
        print_json_report(op_results, step_results, comm_results, comm_shape_results, multi_rank, repeated_structures)
    else:
        print_text_report(op_results, step_results, comm_results, comm_shape_results, multi_rank)


if __name__ == "__main__":
    main()
