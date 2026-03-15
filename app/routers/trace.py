"""Trace 文件流式传输路由。"""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.config import WORKDIR_DIR
from app.database import get_db

router = APIRouter(prefix="/api", tags=["trace"])


@router.get("/jobs/{job_id}/trace")
async def get_trace(job_id: str):
    """流式传输 trace_view.json（可能 500MB+）。"""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT trace_path FROM jobs WHERE id=?", (job_id,))
        row = await cursor.fetchone()
        if not row or not row["trace_path"]:
            raise HTTPException(404, "Trace 文件不存在")
    finally:
        await db.close()

    trace_path = WORKDIR_DIR / job_id / row["trace_path"]
    if not trace_path.exists():
        raise HTTPException(404, "Trace 文件不存在")

    file_size = trace_path.stat().st_size

    def iter_file():
        with open(trace_path, "rb") as f:
            while chunk := f.read(1024 * 1024):  # 1MB chunks
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type="application/json",
        headers={
            "Content-Length": str(file_size),
            "Content-Disposition": f"attachment; filename=trace_{job_id}.json",
        },
    )
