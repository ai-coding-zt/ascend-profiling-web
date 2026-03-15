#!/usr/bin/env python3
"""解析 step_trace CSV 文件，输出每迭代时间分解和统计信息。

用法:
  python parse_step_trace.py -f step_trace_time.csv
  python parse_step_trace.py -f step_trace_time.csv --json
"""

import argparse
import csv
import json
import math
import sys


# step_trace 中的总时间字段（优先级从高到低）
TOTAL_FIELDS = ["Stage", "Duration"]

# step_trace 中的分解时间字段
BREAKDOWN_FIELDS = [
    "Computing",
    "Communication(Not Overlapped)",
    "Overlapped",
    "Free",
    "Bubble",
    "Data_aug Bound",
    "Iteration Refresh",
    "Preparing",
    "FP_BP Time",
    "Reduce",
]

# 还有些额外字段仅用于统计展示
EXTRA_FIELDS = [
    "Communication",
    "Communication(Not Overlapped and Exclude Receive)",
]


def parse_float(val):
    """安全解析浮点数。"""
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def compute_stats(values):
    """计算均值、标准差、最小、最大。"""
    if not values:
        return {"mean": 0, "std": 0, "min": 0, "max": 0, "count": 0}
    n = len(values)
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / n if n > 1 else 0
    return {
        "mean": mean,
        "std": math.sqrt(variance),
        "min": min(values),
        "max": max(values),
        "count": n,
    }


def parse_step_trace(filepath):
    """解析 step_trace CSV。"""
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []

        # Find total field
        total_field = None
        for tf in TOTAL_FIELDS:
            if tf in fieldnames:
                total_field = tf
                break

        # Find breakdown fields
        breakdown = [col for col in BREAKDOWN_FIELDS if col in fieldnames]
        extra = [col for col in EXTRA_FIELDS if col in fieldnames]

        if not total_field and not breakdown:
            print(f"错误: 未找到已知时间字段，可用字段: {fieldnames}", file=sys.stderr)
            sys.exit(1)

        all_fields = ([total_field] if total_field else []) + breakdown + extra

        # 收集所有 step 数据
        steps = []
        for row in reader:
            step = {}
            for field in all_fields:
                step[field] = parse_float(row.get(field, 0))
            for id_field in ["Rank", "Step", "Iteration ID", "Type", "Device_id"]:
                if id_field in fieldnames:
                    step[id_field] = row.get(id_field, "")
            steps.append(step)

    return steps, total_field, breakdown, extra


def format_table(steps, total_field, breakdown, extra):
    """格式化输出表格和统计信息。"""
    if not steps:
        print("无数据。")
        return

    # Use total_field for percentage calculation
    if total_field:
        total_mean = compute_stats([s.get(total_field, 0) for s in steps])["mean"]
    else:
        # Fallback: sum of breakdown fields
        total_mean = sum(
            compute_stats([s.get(f, 0) for s in steps])["mean"]
            for f in breakdown
        )

    # 1. 百分比分解（均值）
    print("=== 迭代时间分解（均值占比） ===\n")

    if total_field:
        print(f"  {'总迭代时间 (' + total_field + ')':<40s}  {total_mean:10.1f} us  (100.0%)\n")

    for field in breakdown:
        values = [s.get(field, 0) for s in steps]
        stats = compute_stats(values)
        pct = stats["mean"] / total_mean * 100 if total_mean > 0 else 0
        filled = min(int(pct / 2), 40)
        bar = "█" * filled + "░" * (40 - filled)
        print(f"  {field:<40s}  {bar}  {stats['mean']:10.1f} us  ({pct:5.1f}%)")

    # Key insights
    print("\n--- 关键判断 ---")
    free_stats = compute_stats([s.get("Free", 0) for s in steps])
    free_pct = free_stats["mean"] / total_mean * 100 if total_mean > 0 else 0
    if free_pct > 15:
        print(f"  [!] Free/Idle 占比 {free_pct:.1f}% — 下发瓶颈，检查 aclOpCompile / synchronize")
    comp_stats = compute_stats([s.get("Computing", 0) for s in steps])
    comp_pct = comp_stats["mean"] / total_mean * 100 if total_mean > 0 else 0
    comm_stats = compute_stats([s.get("Communication(Not Overlapped)", 0) for s in steps])
    comm_pct = comm_stats["mean"] / total_mean * 100 if total_mean > 0 else 0
    if comm_pct > 30:
        print(f"  [!] 非重叠通信占比 {comm_pct:.1f}% — 通信瓶颈")
    data_aug_stats = compute_stats([s.get("Data_aug Bound", 0) for s in steps])
    data_aug_pct = data_aug_stats["mean"] / total_mean * 100 if total_mean > 0 else 0
    if data_aug_pct > 10:
        print(f"  [!] 数据预处理占比 {data_aug_pct:.1f}% — DataLoader 瓶颈")
    if free_pct <= 15 and comm_pct <= 30 and data_aug_pct <= 10:
        print(f"  Computing {comp_pct:.1f}% | Comm {comm_pct:.1f}% | Free {free_pct:.1f}% — 分布正常")

    # 2. 统计信息
    all_report = ([total_field] if total_field else []) + breakdown + extra
    print(f"\n=== 迭代统计（共 {len(steps)} 个 step） ===\n")
    header = f"  {'字段':<40s}  {'均值(us)':>10s}  {'标准差':>10s}  {'最小值':>10s}  {'最大值':>10s}  {'CV':>6s}"
    print(header)
    print("  " + "-" * (len(header) - 2))

    for field in all_report:
        values = [s.get(field, 0) for s in steps]
        stats = compute_stats(values)
        cv = stats["std"] / stats["mean"] * 100 if stats["mean"] > 0 else 0
        print(
            f"  {field:<40s}  {stats['mean']:10.1f}  {stats['std']:10.1f}  "
            f"{stats['min']:10.1f}  {stats['max']:10.1f}  {cv:5.1f}%"
        )


def format_json(steps, total_field, breakdown, extra):
    """输出 JSON 格式。"""
    if total_field:
        total_mean = compute_stats([s.get(total_field, 0) for s in steps])["mean"]
    else:
        total_mean = sum(
            compute_stats([s.get(f, 0) for s in steps])["mean"]
            for f in breakdown
        )

    output = {
        "step_count": len(steps),
        "total_field": total_field,
        "mean_step_time_us": round(total_mean, 1),
        "breakdown": {},
        "statistics": {},
    }

    for field in breakdown:
        values = [s.get(field, 0) for s in steps]
        stats = compute_stats(values)
        pct = round(stats["mean"] / total_mean * 100, 2) if total_mean > 0 else 0
        output["breakdown"][field] = {
            "mean_us": round(stats["mean"], 1),
            "pct": pct,
        }

    all_report = ([total_field] if total_field else []) + breakdown + extra
    for field in all_report:
        values = [s.get(field, 0) for s in steps]
        stats = compute_stats(values)
        stats["percentage"] = round(stats["mean"] / total_mean * 100, 2) if total_mean > 0 else 0
        output["statistics"][field] = stats

    print(json.dumps(output, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="解析 step_trace CSV → 迭代时间分解")
    parser.add_argument("-f", "--file", required=True, help="step_trace CSV 文件路径")
    parser.add_argument("--json", action="store_true", help="输出 JSON 格式")

    args = parser.parse_args()

    steps, total_field, breakdown, extra = parse_step_trace(args.file)

    if not steps:
        print("未找到 step 数据。")
        return

    if args.json:
        format_json(steps, total_field, breakdown, extra)
    else:
        format_table(steps, total_field, breakdown, extra)


if __name__ == "__main__":
    main()
