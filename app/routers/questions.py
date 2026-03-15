"""Q&A 路由 — 收集用户问题与截图。"""

import json
import uuid

from fastapi import APIRouter, HTTPException, UploadFile

from app.config import IMAGE_DIR
from app.database import get_db
from app.models import QuestionIn, QuestionOut

router = APIRouter(prefix="/api", tags=["questions"])


@router.post("/images")
async def upload_image(file: UploadFile):
    """上传截图，返回图片 URL。"""
    if not file.filename:
        raise HTTPException(400, "缺少文件名")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "png"
    if ext not in ("png", "jpg", "jpeg", "gif", "webp"):
        raise HTTPException(400, "不支持的图片格式")

    image_id = uuid.uuid4().hex[:12]
    filename = f"{image_id}.{ext}"
    path = IMAGE_DIR / filename

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB
        raise HTTPException(413, "图片大小超过限制 (10MB)")

    path.write_bytes(content)
    return {"url": f"/data/images/{filename}"}


@router.post("/questions")
async def create_question(q: QuestionIn):
    qid = uuid.uuid4().hex[:12]
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO questions (id, job_id, question, context, image_paths) VALUES (?, ?, ?, ?, ?)",
            (qid, q.job_id, q.question, q.context, json.dumps(q.image_paths)),
        )
        await db.commit()
    finally:
        await db.close()
    return {"id": qid}


@router.get("/questions")
async def list_questions() -> list[QuestionOut]:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, job_id, question, context, image_paths, created_at "
            "FROM questions ORDER BY created_at DESC LIMIT 100"
        )
        rows = await cursor.fetchall()
        return [
            QuestionOut(
                id=r["id"], job_id=r["job_id"], question=r["question"],
                context=r["context"],
                image_paths=json.loads(r["image_paths"]) if r["image_paths"] else [],
                created_at=r["created_at"],
            )
            for r in rows
        ]
    finally:
        await db.close()
