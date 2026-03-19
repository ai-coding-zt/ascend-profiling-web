# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Server Environment

- 机器：`root@175.100.2.7`
- Conda 环境：`torch280_py310_diffusion`
- `export ASCEND_RT_VISIBLE_DEVICES=7` — 仅用第 8 张卡

## What This Repo Is

This is a **Claude Code skill** (`ascend-profiling-collect`) — a knowledge base and tooling package for Huawei Ascend NPU profiling data collection, parsing, and analysis. It is NOT a typical software project with build/test workflows. The primary artifact is `SKILL.md`, which serves as the skill prompt loaded by Claude Code.

## Repository Structure

```
ascend-profiling-collect/
├── SKILL.md                  # Main skill definition (frontmatter + prompt content)
├── references/               # Detailed API reference docs (loaded on demand)
│   ├── pytorch-profiler-detail.md    # torch_npu.profiler API reference
│   ├── msprof-collect-detail.md      # msprof CLI collection reference
│   └── msprof-parse-detail.md        # msprof parse/export reference
├── assets/                   # 52 performance metric documentation files
│   ├── op_summary(算子详细信息).md
│   ├── step_trace(迭代轨迹信息).md
│   └── ...                   # One file per metric type (operator, memory, comm, etc.)
└── scripts/
    └── search_metrics.py     # CLI tool to search metric docs by keyword/category
```

## Key Conventions

- `SKILL.md` uses YAML frontmatter (`name`, `description`) followed by markdown content. The frontmatter `description` field controls when this skill triggers.
- `references/` docs are referenced from SKILL.md via relative paths like `references/pytorch-profiler-detail.md` — these are read on demand, not inlined.
- `assets/` contains 52 individual metric definition files. File names encode both the English metric key and Chinese description in parentheses, e.g. `op_summary(算子详细信息).md`.
- All documentation is in Chinese (zh-CN).

## Working with search_metrics.py

```bash
python scripts/search_metrics.py --list              # List all 52 metric files
python scripts/search_metrics.py --list --category   # List grouped by category
python scripts/search_metrics.py "keyword"           # Search by keyword across filenames/content
```

The script reads from `assets/` directory (relative to script location). Categories: 算子与调度, 内存, 通信, 系统与Host, 硬件PMU与缓存, 综合数据.

## Content Domain

Two profiling approaches are documented:
1. **PyTorch Profiler** (`torch_npu.profiler`) — code-level instrumentation for PyTorch training/inference
2. **msprof CLI** — command-line tool for any AI workload (C++/Python/Shell)

The skill covers the full workflow: configure → collect → parse/export → visualize (Perfetto UI / MindStudio Insight).
