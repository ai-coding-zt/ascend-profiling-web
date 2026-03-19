#!/usr/bin/env python3
"""搜索昇腾 Profiling 性能分析 Playbook 文档。

用法:
  python search_playbooks.py --list              # 列出所有 playbook 及摘要
  python search_playbooks.py --list --category   # 按分类列出
  python search_playbooks.py <keyword>           # 搜索关键字（文件名/标题/内容）

示例:
  python search_playbooks.py "算子"              # 搜索算子相关 playbook
  python search_playbooks.py "通信"              # 搜索通信相关 playbook
  python search_playbooks.py "内存"              # 搜索内存相关 playbook
"""

import argparse
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ASSETS_DIR = SCRIPT_DIR.parent / "assets"


def get_md_files():
    """递归获取所有 .md 文件，按路径排序。"""
    if not ASSETS_DIR.exists():
        print(f"错误: 文档目录不存在: {ASSETS_DIR}", file=sys.stderr)
        sys.exit(1)
    return sorted(ASSETS_DIR.rglob("*.md"))


def get_category(filepath):
    """从文件的父目录名提取分类。"""
    rel = filepath.relative_to(ASSETS_DIR)
    if len(rel.parts) > 1:
        return rel.parts[0]
    return "未分类"


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
    """提取一句话摘要：括号内中文说明或标题。"""
    stem = filepath.stem
    m = re.search(r"[（(](.+?)[）)]", stem)
    if m:
        return m.group(1)
    return extract_title(filepath)


def cmd_list(by_category=False):
    """列出所有 playbook 文件。"""
    files = get_md_files()
    if not files:
        print("未找到任何 playbook 文件。")
        return

    if not by_category:
        print(f"共 {len(files)} 个分析 Playbook:\n")
        for f in files:
            summary = extract_summary(f)
            rel = f.relative_to(ASSETS_DIR)
            print(f"  {str(rel):<65s} {summary}")
    else:
        categorized = {}
        for f in files:
            cat = get_category(f)
            categorized.setdefault(cat, []).append(f)

        for cat in sorted(categorized.keys()):
            cat_files = categorized[cat]
            print(f"\n## {cat} ({len(cat_files)} 个)")
            for f in cat_files:
                summary = extract_summary(f)
                print(f"  {f.name:<60s} {summary}")

        print(f"\n共 {len(files)} 个文件")


def cmd_search(keyword):
    """在文件名、标题和内容中搜索关键字。"""
    files = get_md_files()
    keyword_lower = keyword.lower()
    results = []

    for filepath in files:
        matches = []

        if keyword_lower in filepath.name.lower():
            matches.append(("文件名", filepath.name, 0))

        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()

        for i, line in enumerate(lines):
            if keyword_lower in line.lower():
                stripped = line.strip()
                if stripped.startswith("<!-- "):
                    continue
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
        print(f'未找到与 "{keyword}" 相关的 playbook。')
        return

    print(f'搜索 "{keyword}" — 匹配 {len(results)} 个文件:\n')

    for filepath, matches in results:
        summary = extract_summary(filepath)
        cat = get_category(filepath)
        print(f"  {filepath.name}  [{cat}]")
        print(f"   摘要: {summary}")
        print(f"   路径: {filepath}")

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
        description="搜索昇腾 Profiling 性能分析 Playbook 文档",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("keyword", nargs="?", help="搜索关键字")
    parser.add_argument("--list", action="store_true", help="列出所有 playbook")
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
