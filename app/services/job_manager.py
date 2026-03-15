"""任务队列管理 — asyncio.Semaphore 并发控制。"""

import asyncio
import json
import shutil
import traceback
import uuid
from pathlib import Path

from app.config import MAX_CONCURRENCY, RESULT_DIR, UPLOAD_DIR, WORKDIR_DIR
from app.database import get_db
from app.services.analyzer import find_trace_file, run_analysis
from app.services.unpacker import extract_archive, find_profiling_root

_semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

# SSE 事件通道: job_id -> list[asyncio.Queue]
_event_channels: dict[str, list[asyncio.Queue]] = {}


def subscribe(job_id: str) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue()
    _event_channels.setdefault(job_id, []).append(queue)
    return queue


def unsubscribe(job_id: str, queue: asyncio.Queue):
    channels = _event_channels.get(job_id, [])
    if queue in channels:
        channels.remove(queue)
    if not channels:
        _event_channels.pop(job_id, None)


async def _send_event(job_id: str, event: str, data: str):
    for q in _event_channels.get(job_id, []):
        await q.put({"event": event, "data": data})


async def _update_status(job_id: str, status: str, error: str | None = None, trace_path: str | None = None):
    db = await get_db()
    try:
        if trace_path:
            await db.execute(
                "UPDATE jobs SET status=?, error=?, trace_path=?, updated_at=datetime('now') WHERE id=?",
                (status, error, trace_path, job_id),
            )
        else:
            await db.execute(
                "UPDATE jobs SET status=?, error=?, updated_at=datetime('now') WHERE id=?",
                (status, error, job_id),
            )
        await db.commit()
    finally:
        await db.close()
    await _send_event(job_id, "status", json.dumps({"status": status, "error": error}))


async def create_job(filename: str, file_content: bytes) -> str:
    """创建分析任务，保存文件，启动异步处理。"""
    job_id = uuid.uuid4().hex[:12]
    upload_path = UPLOAD_DIR / f"{job_id}_{filename}"
    upload_path.write_bytes(file_content)

    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO jobs (id, filename, status) VALUES (?, ?, 'queued')",
            (job_id, filename),
        )
        await db.commit()
    finally:
        await db.close()

    asyncio.create_task(_process_job(job_id, upload_path))
    return job_id


async def _process_job(job_id: str, upload_path: Path):
    """处理单个分析任务。"""
    async with _semaphore:
        workdir = WORKDIR_DIR / job_id
        try:
            # 1. 解压
            await _update_status(job_id, "unpacking")
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, extract_archive, upload_path, workdir)

            # 2. 查找 profiling 根目录
            profiling_root = await loop.run_in_executor(None, find_profiling_root, workdir)
            if profiling_root is None:
                raise RuntimeError("未找到有效的 profiling 数据目录")

            # 3. 分析
            await _update_status(job_id, "analyzing")
            result = await run_analysis(profiling_root)

            # 4. 保存结果
            result_path = RESULT_DIR / f"{job_id}.json"
            result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

            # 5. 查找 trace 文件
            trace_file = await loop.run_in_executor(None, find_trace_file, workdir)
            trace_rel = str(trace_file.relative_to(workdir)) if trace_file else None

            await _update_status(job_id, "done", trace_path=trace_rel)

        except Exception as e:
            tb = traceback.format_exc()
            error_msg = f"{type(e).__name__}: {e}"
            await _update_status(job_id, "failed", error=error_msg)
            await _send_event(job_id, "error", json.dumps({"error": error_msg, "traceback": tb}))

        finally:
            # 清理上传文件
            if upload_path.exists():
                upload_path.unlink(missing_ok=True)
            # 发送完成事件
            await _send_event(job_id, "done", "{}")
