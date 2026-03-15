"""定期清理旧文件。"""

import asyncio
import shutil
import time
from pathlib import Path

from app.config import (
    CLEANUP_INTERVAL,
    CLEANUP_RESULT_TTL,
    CLEANUP_UPLOAD_TTL,
    IMAGE_DIR,
    RESULT_DIR,
    UPLOAD_DIR,
    WORKDIR_DIR,
)


def _cleanup_dir(directory: Path, ttl_seconds: int):
    now = time.time()
    if not directory.exists():
        return
    for item in directory.iterdir():
        try:
            mtime = item.stat().st_mtime
            if now - mtime > ttl_seconds:
                if item.is_dir():
                    shutil.rmtree(item, ignore_errors=True)
                else:
                    item.unlink(missing_ok=True)
        except OSError:
            pass


async def cleanup_loop():
    """后台清理循环。"""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _cleanup_dir, UPLOAD_DIR, CLEANUP_UPLOAD_TTL)
        await loop.run_in_executor(None, _cleanup_dir, WORKDIR_DIR, CLEANUP_UPLOAD_TTL)
        await loop.run_in_executor(None, _cleanup_dir, RESULT_DIR, CLEANUP_RESULT_TTL)
        await loop.run_in_executor(None, _cleanup_dir, IMAGE_DIR, CLEANUP_RESULT_TTL)
