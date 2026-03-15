"""文件上传路由。"""

from fastapi import APIRouter, HTTPException, UploadFile

from app.config import MAX_UPLOAD_SIZE
from app.services.job_manager import create_job

router = APIRouter(prefix="/api", tags=["upload"])

ALLOWED_EXTENSIONS = {".tar.gz", ".tgz", ".tar.bz2", ".tar", ".zip", ".rar"}


def _check_extension(filename: str) -> bool:
    lower = filename.lower()
    return any(lower.endswith(ext) for ext in ALLOWED_EXTENSIONS)


@router.post("/jobs")
async def upload_file(file: UploadFile):
    if not file.filename or not _check_extension(file.filename):
        raise HTTPException(400, f"不支持的文件格式。支持: {', '.join(ALLOWED_EXTENSIONS)}")

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"文件大小超过限制 ({MAX_UPLOAD_SIZE // (1024*1024)} MB)")

    job_id = await create_job(file.filename, content)
    return {"id": job_id, "status": "queued"}
