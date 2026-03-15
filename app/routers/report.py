"""报告数据路由。"""

import json

from fastapi import APIRouter, HTTPException

from app.config import RESULT_DIR

router = APIRouter(prefix="/api", tags=["report"])


@router.get("/jobs/{job_id}/report")
async def get_report(job_id: str):
    result_path = RESULT_DIR / f"{job_id}.json"
    if not result_path.exists():
        raise HTTPException(404, "分析结果不存在")
    data = json.loads(result_path.read_text(encoding="utf-8"))
    return data
