"""任务状态查询路由。"""

import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.database import get_db
from app.models import JobOut
from app.services.job_manager import subscribe, unsubscribe

router = APIRouter(prefix="/api", tags=["jobs"])


@router.get("/jobs")
async def list_jobs() -> list[JobOut]:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, filename, status, error, trace_path, created_at, updated_at "
            "FROM jobs ORDER BY created_at DESC LIMIT 50"
        )
        rows = await cursor.fetchall()
        return [
            JobOut(
                id=r["id"], filename=r["filename"], status=r["status"],
                error=r["error"], trace_path=r["trace_path"],
                created_at=r["created_at"], updated_at=r["updated_at"],
            )
            for r in rows
        ]
    finally:
        await db.close()


@router.get("/jobs/{job_id}")
async def get_job(job_id: str) -> JobOut:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, filename, status, error, trace_path, created_at, updated_at "
            "FROM jobs WHERE id=?",
            (job_id,),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "任务不存在")
        return JobOut(
            id=row["id"], filename=row["filename"], status=row["status"],
            error=row["error"], trace_path=row["trace_path"],
            created_at=row["created_at"], updated_at=row["updated_at"],
        )
    finally:
        await db.close()


@router.get("/jobs/{job_id}/events")
async def job_events(job_id: str):
    """SSE 事件流 — 推送任务进度。"""
    # 验证任务存在
    db = await get_db()
    try:
        cursor = await db.execute("SELECT status FROM jobs WHERE id=?", (job_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "任务不存在")
        current_status = row["status"]
    finally:
        await db.close()

    if current_status in ("done", "failed"):
        async def done_stream():
            yield f"event: status\ndata: {json.dumps({'status': current_status})}\n\n"
            yield "event: done\ndata: {}\n\n"
        return StreamingResponse(done_stream(), media_type="text/event-stream")

    queue = subscribe(job_id)

    async def event_stream():
        try:
            # 先发送当前状态
            yield f"event: status\ndata: {json.dumps({'status': current_status})}\n\n"
            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"event: {msg['event']}\ndata: {msg['data']}\n\n"
                    if msg["event"] == "done":
                        break
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            unsubscribe(job_id, queue)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
