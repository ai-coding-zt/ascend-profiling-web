# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ascend Profiling Web is a web platform for analyzing Huawei Ascend NPU profiling data. Users upload profiling archives (tar.gz/zip/rar), the system unpacks and analyzes the data, then presents interactive reports with an AI chat assistant powered by Claude CLI.

**Tech stack:** Python 3.10+, FastAPI, aiosqlite (SQLite with WAL mode), Jinja2 templates, vanilla JS frontend, Perfetto UI integration.

## Commands

```bash
# Run dev server
uvicorn app.main:app --reload --port 8080

# Run with Docker
docker compose up --build

# Install dependencies
pip install -r requirements.txt

# Run analysis script standalone (for testing)
python -m app.analysis.analyze_profiling -d <profiling_dir> --json -n 30

# Download Perfetto UI for offline use
bash scripts/download_perfetto.sh
```

## Architecture

### Request Flow

Upload archive → `routers/upload.py` → `services/job_manager.py` (creates job, spawns async task) → `services/unpacker.py` (extract) → `services/analyzer.py` (subprocess call to `analyze_profiling.py`) → result JSON saved to `data/results/{job_id}.json` → SSE events pushed to frontend.

### Key Layers

- **`app/main.py`** — FastAPI app entry point, lifespan manages DB init and cleanup task
- **`app/routers/`** — API and page routes:
  - `upload.py` — `POST /api/jobs` file upload
  - `jobs.py` — `GET/DELETE /api/jobs`, `GET /api/jobs/{id}/events` (SSE)
  - `report.py` / `trace.py` — serve result JSON and trace files
  - `questions.py` — `POST /api/chat` streaming AI chat via Claude CLI subprocess (`claude -p --output-format stream-json`), `POST /api/images` screenshot upload
  - `pages.py` — SSR pages (`/`, `/report/{id}`, `/questions`)
  - `perfetto_proxy.py` — reverse proxy to `ui.perfetto.dev` for same-origin iframe embedding
- **`app/services/`** — Business logic:
  - `job_manager.py` — Async job queue with `asyncio.Semaphore(MAX_CONCURRENCY)`, SSE event channels via `dict[str, list[asyncio.Queue]]`
  - `analyzer.py` — Runs `analyze_profiling.py` as subprocess with timeout
  - `unpacker.py` — Archive extraction (tar/zip/rar) with zip-slip protection, profiling root detection via marker files
  - `cleanup.py` — Background TTL-based file cleanup loop
- **`app/analysis/analyze_profiling.py`** — Core analysis script (~67KB), parses profiling CSVs: op_summary, kernel_details, step_trace, communication stats, operator details. Outputs JSON to stdout. Supports multi-rank analysis and repeated structure detection.
- **`app/config.py`** — All config via env vars (paths, limits, timeouts)
- **`app/database.py`** — SQLite schema (jobs + questions tables), auto-migration

### Data Flow

- `data/uploads/` — Temporary uploaded archives (cleaned after 24h)
- `data/workdirs/{job_id}/` — Extracted profiling data (cleaned after 24h)
- `data/results/{job_id}.json` — Analysis result JSON (cleaned after 7d)
- `data/images/` — User-uploaded screenshots for Q&A
- `data/profiling.db` — SQLite database (WAL mode)

### Frontend

- `app/templates/` — Jinja2: `base.html`, `index.html` (dashboard), `report.html` (analysis report), `questions.html`
- `static/js/` — `upload.js` (drag-drop upload + SSE progress), `report.js` (report rendering), `questions.js` (AI chat with streaming SSE), `perfetto.js` (Perfetto iframe integration), `theme.js` (dark/light mode)
- `static/css/style.css` — All styles

### Concurrency Model

Job processing uses `asyncio.Semaphore` (default 4) for backpressure. Analysis runs as a subprocess to avoid blocking the event loop. SSE channels use per-job `asyncio.Queue` lists for real-time progress updates.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_CONCURRENCY` | 4 | Max concurrent analysis jobs |
| `ANALYSIS_TIMEOUT` | 300 | Analysis subprocess timeout (seconds) |
| `MAX_UPLOAD_SIZE` | 2GB | Upload file size limit |
| `CLEANUP_UPLOAD_TTL` | 86400 | Upload/workdir cleanup interval (seconds) |
| `CLEANUP_RESULT_TTL` | 604800 | Result/image cleanup interval (seconds) |

## Conventions

- All user-facing text is in Chinese (中文)
- Code comments and docstrings are in Chinese
- The AI chat feature requires `claude` CLI to be installed and available in PATH
- Profiling data detection relies on marker files: `kernel_details.csv`, `op_summary`, `step_trace`, `ASCEND_PROFILER_OUTPUT`, `PROF_*` directories
