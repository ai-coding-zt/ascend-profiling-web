# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A **Claude Code skill** (`ascend-profiling-analyze`) — a knowledge base for Huawei Ascend NPU profiling data **analysis and optimization**. It complements the sibling `ascend-profiling-collect` skill (which covers data *collection*). The primary artifact is `SKILL.md`.

## Repository Structure

```
ascend-profiling-analyze/
├── SKILL.md                          # Main skill definition (frontmatter + prompt)
├── references/                       # Detailed tool reference docs (loaded on demand)
│   ├── msprof-analyze-detail.md      # msprof-analyze CLI full reference
│   ├── advisor-detail.md             # advisor sub-command reference
│   ├── compare-tools-detail.md       # compare sub-command reference
│   ├── cluster-analyse-detail.md     # cluster analysis reference
│   └── visualization-tools-detail.md # Perfetto / MindStudio Insight / TensorBoard
├── assets/                           # Scenario-based analysis playbooks (by category)
│   ├── 01_算子性能分析/              # Operator performance analysis
│   ├── 02_通信分析/                  # Communication analysis
│   ├── 03_内存分析/                  # Memory analysis
│   └── 04_迭代与流水线分析/          # Iteration & pipeline analysis
└── scripts/
    ├── analyze_profiling.py          # PRIMARY: comprehensive analysis (auto-discover CSVs → report)
    ├── parse_op_summary.py           # Parse op_summary/kernel_details CSV → top-N + cube/vector + suggestions
    ├── parse_step_trace.py           # Parse step_trace CSV → time breakdown
    ├── parse_comm_stats.py           # Parse communication CSV → bandwidth stats
    └── search_playbooks.py           # CLI search tool for playbooks
```

## Key Conventions

- `SKILL.md` uses YAML frontmatter (`name`, `description`) — the `description` controls skill triggering.
- `references/` docs are loaded on demand via relative paths from SKILL.md.
- Assets use **subdirectories** (unlike sibling's flat structure) — playbooks are scenario-based.
- All documentation is in Chinese (zh-CN).
- Scripts use Python stdlib only (`csv`, `argparse`, `pathlib`, `heapq`) — no pandas.
- Metric field definitions live in sibling `ascend-profiling-collect/assets/` — this skill references them, not copies.

## Useful Commands

```bash
# PRIMARY: comprehensive analysis from profiling directory
python scripts/analyze_profiling.py -d <profiling_dir>           # Full text report
python scripts/analyze_profiling.py -d <profiling_dir> --json    # JSON output

# Individual file analysis
python scripts/parse_op_summary.py -f op_summary.csv --analyze   # Full analysis with suggestions
python scripts/parse_op_summary.py -f kernel_details.csv --json  # JSON output
python scripts/parse_step_trace.py -f step_trace_time.csv        # Iteration breakdown
python scripts/parse_comm_stats.py -f communication_statistic.csv # Communication stats

# Playbook search
python scripts/search_playbooks.py --list --category
python scripts/search_playbooks.py "keyword"
```

## TEST SERVER INFO
- Server: root@175.100.2.7
- Conda ENV: torch280_py310_diffusion
- ENV: `export ASCEND_RT_VISIBLE_DEVICES=7 # ONlY USE THE 8th CARD TO TEST`

> Once you generate a skill, please verify the skill on the server.
