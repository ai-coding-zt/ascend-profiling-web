#!/usr/bin/env python3
"""搜索昇腾 Profiling 性能指标文档。

用法:
  python search_metrics.py --list              # 列出所有指标文件及摘要
  python search_metrics.py --list --category   # 按分类列出
  python search_metrics.py <keyword>           # 搜索关键字（文件名/标题/字段名/内容）

示例:
  python search_metrics.py "op_summary"        # 按文件名搜索
  python search_metrics.py "Task Duration"     # 按字段名搜索
  python search_metrics.py "内存"               # 按中文关键字搜索
  python search_metrics.py "带宽"               # 跨分类搜索
"""

import argparse
import os
import re
import sys
from pathlib import Path

# 指标文件目录 (相对于脚本所在位置)
SCRIPT_DIR = Path(__file__).resolve().parent
DOCS_DIR = SCRIPT_DIR.parent / "assets"

# 分类映射 (有序列表，按优先级匹配：更具体的分类在前)
CATEGORIES_ORDER = [
    ("系统与Host", [
        "process_cpu_usage", "host_cpu_usage", "host_disk_usage",
        "host_network_usage", "cpu_usage(host", "msproftx",
    ]),
    ("算子与调度", [
        "op_summary", "op_statistic", "task_time", "step_trace",
        "api_statistic", "fusion_op", "aicpu", "aicpu_mi", "dp(", "dvpp",
        "os_runtime_statistic", "cpu_usage(",
    ]),
    ("内存", [
        "npu_mem", "npu_module_mem", "memory_record", "operator_memory",
        "static_op_mem", "process_mem", "sys_mem", "host_mem_usage", "片上内存",
    ]),
    ("通信", [
        "communication_statistic", "hccs(", "pcie(", "nic(", "roce(",
        "starschiptrans", "starssocinfo",
    ]),
    ("硬件PMU与缓存", [
        "ai_core_utilization", "ai_vector_core_utilization",
        "biu_group", "accpmu", "l2_cache", "llc_read_write",
        "pmu_events", "top_function",
    ]),
    ("综合数据", [
        "总体说明", "msprof(timeline", "msprof导出db",
    ]),
]
# Keep dict form for --list without --category
CATEGORIES = {cat: kws for cat, kws in CATEGORIES_ORDER}


def get_md_files():
    """获取所有 .md 文件，按文件名排序。"""
    if not DOCS_DIR.exists():
        print(f"错误: 文档目录不存在: {DOCS_DIR}", file=sys.stderr)
        sys.exit(1)
    return sorted(DOCS_DIR.glob("*.md"))


def extract_title(filepath):
    """从 markdown 文件提取标题（第一个 # 行）。"""
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("<!-- "):
                continue
            if line.startswith("# "):
                return line.lstrip("# ").strip()
            if line:
                return line
    return filepath.stem


def extract_summary(filepath):
    """提取一句话摘要：标题或文件名中括号内的中文说明。"""
    stem = filepath.stem
    # 尝试从文件名提取括号内说明 e.g. "op_summary(算子详细信息)"
    m = re.search(r"[（(](.+?)[）)]", stem)
    if m:
        return m.group(1)
    # 否则用标题
    return extract_title(filepath)


def categorize_file(filepath):
    """判断文件属于哪个分类（按优先级匹配）。"""
    name = filepath.name.lower()
    for cat, keywords in CATEGORIES_ORDER:
        for kw in keywords:
            if kw.lower() in name:
                return cat
    return "其他"


def cmd_list(by_category=False):
    """列出所有指标文件。"""
    files = get_md_files()
    if not by_category:
        print(f"共 {len(files)} 个性能指标文档:\n")
        for f in files:
            summary = extract_summary(f)
            print(f"  {f.name:<60s} {summary}")
    else:
        categorized = {}
        uncategorized = []
        for f in files:
            cat = categorize_file(f)
            if cat == "其他":
                uncategorized.append(f)
            else:
                categorized.setdefault(cat, []).append(f)

        # 按预定义顺序输出
        for cat, _ in CATEGORIES_ORDER:
            if cat in categorized:
                print(f"\n## {cat} ({len(categorized[cat])} 个)")
                for f in categorized[cat]:
                    summary = extract_summary(f)
                    print(f"  {f.name:<60s} {summary}")

        if uncategorized:
            print(f"\n## 其他 ({len(uncategorized)} 个)")
            for f in uncategorized:
                summary = extract_summary(f)
                print(f"  {f.name:<60s} {summary}")

        total = len(files)
        print(f"\n共 {total} 个文件")


def cmd_search(keyword):
    """在文件名、标题、字段名和内容中搜索关键字。"""
    files = get_md_files()
    keyword_lower = keyword.lower()
    results = []

    for filepath in files:
        matches = []
        stem_lower = filepath.stem.lower()
        name_lower = filepath.name.lower()

        # 1. 文件名匹配
        if keyword_lower in name_lower:
            matches.append(("文件名", filepath.name, 0))

        # 2. 内容匹配
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()

        for i, line in enumerate(lines):
            if keyword_lower in line.lower():
                # 跳过 source 注释
                stripped = line.strip()
                if stripped.startswith("<!-- source:"):
                    continue
                # 判断匹配类型
                if stripped.startswith("#"):
                    match_type = "标题"
                elif "|" in stripped:
                    match_type = "表格/字段"
                else:
                    match_type = "内容"
                matches.append((match_type, stripped[:120], i + 1))

        if matches:
            results.append((filepath, matches))

    if not results:
        print(f"未找到与 \"{keyword}\" 相关的指标文件。")
        return

    print(f"搜索 \"{keyword}\" — 匹配 {len(results)} 个文件:\n")

    for filepath, matches in results:
        summary = extract_summary(filepath)
        cat = categorize_file(filepath)
        print(f"📄 {filepath.name}  [{cat}]")
        print(f"   摘要: {summary}")
        print(f"   路径: {filepath}")

        # 显示前 5 个匹配（避免输出过多）
        shown = 0
        for match_type, content, lineno in matches:
            if shown >= 5:
                remaining = len(matches) - shown
                print(f"   ... 还有 {remaining} 处匹配")
                break
            if lineno > 0:
                print(f"   L{lineno:4d} [{match_type}] {content}")
            else:
                print(f"        [{match_type}] {content}")
            shown += 1
        print()


def main():
    parser = argparse.ArgumentParser(
        description="搜索昇腾 Profiling 性能指标文档",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("keyword", nargs="?", help="搜索关键字")
    parser.add_argument("--list", action="store_true", help="列出所有指标文件")
    parser.add_argument(
        "--category", action="store_true", help="按分类列出（需配合 --list）"
    )

    args = parser.parse_args()

    if args.list:
        cmd_list(by_category=args.category)
    elif args.keyword:
        cmd_search(args.keyword)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
