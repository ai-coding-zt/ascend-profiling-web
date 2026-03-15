"""应用配置 — 支持环境变量覆盖。"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(DATA_DIR / "uploads")))
WORKDIR_DIR = Path(os.getenv("WORKDIR_DIR", str(DATA_DIR / "workdirs")))
RESULT_DIR = Path(os.getenv("RESULT_DIR", str(DATA_DIR / "results")))
IMAGE_DIR = Path(os.getenv("IMAGE_DIR", str(DATA_DIR / "images")))
DB_PATH = Path(os.getenv("DB_PATH", str(DATA_DIR / "profiling.db")))

MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", str(2 * 1024 * 1024 * 1024)))  # 2 GB
MAX_CONCURRENCY = int(os.getenv("MAX_CONCURRENCY", "4"))
ANALYSIS_TIMEOUT = int(os.getenv("ANALYSIS_TIMEOUT", "300"))  # 5 minutes

CLEANUP_UPLOAD_TTL = int(os.getenv("CLEANUP_UPLOAD_TTL", str(24 * 3600)))  # 24h
CLEANUP_RESULT_TTL = int(os.getenv("CLEANUP_RESULT_TTL", str(7 * 24 * 3600)))  # 7d
CLEANUP_INTERVAL = int(os.getenv("CLEANUP_INTERVAL", "3600"))  # 1h

ANALYSIS_SCRIPT = Path(__file__).resolve().parent / "analysis" / "analyze_profiling.py"

# Ensure directories exist
for d in (UPLOAD_DIR, WORKDIR_DIR, RESULT_DIR, IMAGE_DIR):
    d.mkdir(parents=True, exist_ok=True)
