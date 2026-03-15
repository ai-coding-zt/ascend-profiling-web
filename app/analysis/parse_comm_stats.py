#!/usr/bin/env python3
"""解析 communication_statistic CSV 文件，输出通信算子统计信息。

用法:
  python parse_comm_stats.py -f communication_statistic_0.csv
  python parse_comm_stats.py -f communication_statistic_0.csv --json
"""

import argparse
import csv
import json
import sys


# 常见字段名
DURATION_FIELDS = ["Duration(us)", "Duration", "Elapse Time(us)", "Total Duration(us)"]
SIZE_FIELDS = ["Size(MB)", "Size", "Transit Size(MB)", "Input Data Size(MB)"]
TYPE_FIELDS = ["Op Type", "OP Type", "Operation", "Comm Op Type", "Name"]


def find_field(fieldnames, candidates):
    """从 CSV header 中找到匹配的字段。"""
    for f in candidates:
        if f in fieldnames:
            return f
    return None


def parse_float(val):
    """安全解析浮点数。"""
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def parse_comm_stats(filepath):
    """解析 communication_statistic CSV。"""
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        duration_field = find_field(reader.fieldnames, DURATION_FIELDS)
        size_field = find_field(reader.fieldnames, SIZE_FIELDS)
        type_field = find_field(reader.fieldnames, TYPE_FIELDS)

        if not duration_field:
            print(f"错误: 未找到耗时字段，可用字段: {reader.fieldnames}", file=sys.stderr)
            sys.exit(1)

        rows = []
        for row in reader:
            rows.append(row)

    return rows, duration_field, size_field, type_field


def format_table(rows, duration_field, size_field, type_field):
    """格式化输出。"""
    if not rows:
        print("无通信数据。")
        return

    total_time = sum(parse_float(r.get(duration_field, 0)) for r in rows)

    # 1. 按通信类型汇总
    if type_field:
        print("=== 按通信类型汇总 ===\n")
        type_stats = {}
        for row in rows:
            op_type = row.get(type_field, "Unknown")
            dur = parse_float(row.get(duration_field, 0))
            size = parse_float(row.get(size_field, 0)) if size_field else 0

            if op_type not in type_stats:
                type_stats[op_type] = {"count": 0, "total_time": 0, "total_size": 0}
            type_stats[op_type]["count"] += 1
            type_stats[op_type]["total_time"] += dur
            type_stats[op_type]["total_size"] += size

        header = f"  {'通信类型':<30s}  {'次数':>6s}  {'总耗时(us)':>14s}  {'占比(%)':>8s}"
        if size_field:
            header += f"  {'总数据量(MB)':>14s}"
        print(header)
        print("  " + "-" * (len(header) - 2))

        for op_type, stats in sorted(type_stats.items(), key=lambda x: x[1]["total_time"], reverse=True):
            pct = stats["total_time"] / total_time * 100 if total_time > 0 else 0
            line = f"  {op_type:<30s}  {stats['count']:6d}  {stats['total_time']:14.1f}  {pct:7.1f}%"
            if size_field:
                line += f"  {stats['total_size']:14.1f}"
            print(line)

        print(f"\n  总计: {len(rows)} 次通信，总耗时 {total_time:.1f} us")

    # 2. Top-10 耗时最长的单次通信
    print("\n=== Top-10 单次通信耗时 ===\n")
    sorted_rows = sorted(rows, key=lambda r: parse_float(r.get(duration_field, 0)), reverse=True)[:10]

    for i, row in enumerate(sorted_rows, 1):
        dur = parse_float(row.get(duration_field, 0))
        op_type = row.get(type_field, "N/A") if type_field else "N/A"
        size = parse_float(row.get(size_field, 0)) if size_field else 0
        line = f"  {i:2d}. {op_type:<30s}  {dur:12.1f} us"
        if size_field:
            line += f"  {size:10.1f} MB"
        print(line)


def format_json(rows, duration_field, size_field, type_field):
    """输出 JSON 格式。"""
    total_time = sum(parse_float(r.get(duration_field, 0)) for r in rows)

    type_stats = {}
    if type_field:
        for row in rows:
            op_type = row.get(type_field, "Unknown")
            dur = parse_float(row.get(duration_field, 0))
            size = parse_float(row.get(size_field, 0)) if size_field else 0

            if op_type not in type_stats:
                type_stats[op_type] = {"count": 0, "total_time": 0, "total_size": 0}
            type_stats[op_type]["count"] += 1
            type_stats[op_type]["total_time"] += dur
            type_stats[op_type]["total_size"] += size

    output = {
        "total_communications": len(rows),
        "total_time_us": total_time,
        "by_type": type_stats,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="解析 communication_statistic CSV → 通信统计")
    parser.add_argument("-f", "--file", required=True, help="communication_statistic CSV 文件路径")
    parser.add_argument("--json", action="store_true", help="输出 JSON 格式")

    args = parser.parse_args()

    rows, duration_field, size_field, type_field = parse_comm_stats(args.file)

    if not rows:
        print("未找到通信数据。")
        return

    if args.json:
        format_json(rows, duration_field, size_field, type_field)
    else:
        format_table(rows, duration_field, size_field, type_field)


if __name__ == "__main__":
    main()
