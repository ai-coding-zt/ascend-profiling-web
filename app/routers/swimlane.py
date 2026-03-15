"""泳道数据 API — 流式返回多卡合并的泳道 JSON。"""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.config import RESULT_DIR, WORKDIR_DIR
from app.database import get_db
from app.services.swimlane_builder import build_swimlane_data

router = APIRouter(prefix="/api", tags=["swimlane"])


@router.get("/jobs/{job_id}/swimlane")
async def get_swimlane(job_id: str):
    """获取泳道数据 JSON（带缓存）。"""
    # 检查缓存
    cache_path = RESULT_DIR / f"{job_id}_swimlane.json"
    if cache_path.exists():
        return _stream_file(cache_path)

    # 检查 job 是否存在
    db = await get_db()
    try:
        cursor = await db.execute("SELECT status FROM jobs WHERE id=?", (job_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(404, "任务不存在")
    finally:
        await db.close()

    workdir = WORKDIR_DIR / job_id
    if not workdir.exists():
        raise HTTPException(404, "工作目录不存在")

    # 构建泳道数据
    data = build_swimlane_data(workdir)

    # 写入缓存
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except OSError:
        pass  # 缓存写入失败不影响返回

    return _stream_file(cache_path) if cache_path.exists() else _json_response(data)


def _stream_file(path: Path) -> StreamingResponse:
    """流式返回 JSON 文件。"""
    file_size = path.stat().st_size

    def iter_file():
        with open(path, "rb") as f:
            while chunk := f.read(1024 * 1024):
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type="application/json",
        headers={"Content-Length": str(file_size)},
    )


def _json_response(data: dict) -> StreamingResponse:
    """直接返回内存中的 JSON。"""
    content = json.dumps(data, ensure_ascii=False).encode("utf-8")

    def iter_content():
        yield content

    return StreamingResponse(
        iter_content(),
        media_type="application/json",
        headers={"Content-Length": str(len(content))},
    )
