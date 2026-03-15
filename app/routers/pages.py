"""SSR 页面路由 — Jinja2 模板渲染。"""

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.config import RESULT_DIR
from app.database import get_db

router = APIRouter(tags=["pages"])
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
async def index(request: Request):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, filename, status, error, trace_path, created_at, updated_at "
            "FROM jobs ORDER BY created_at DESC LIMIT 50"
        )
        jobs = [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()
    return templates.TemplateResponse("index.html", {"request": request, "jobs": jobs})


@router.get("/report/{job_id}", response_class=HTMLResponse)
async def report_page(request: Request, job_id: str):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, filename, status, error, trace_path, created_at, updated_at "
            "FROM jobs WHERE id=?",
            (job_id,),
        )
        job = await cursor.fetchone()
        if not job:
            raise HTTPException(404, "任务不存在")
        job = dict(job)
    finally:
        await db.close()

    result_path = RESULT_DIR / f"{job_id}.json"
    report_data = None
    if result_path.exists():
        report_data = json.loads(result_path.read_text(encoding="utf-8"))

    return templates.TemplateResponse("report.html", {
        "request": request,
        "job": job,
        "report": report_data,
        "report_json": json.dumps(report_data, ensure_ascii=False) if report_data else "null",
    })


@router.get("/questions", response_class=HTMLResponse)
async def questions_page(request: Request):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT q.id, q.job_id, q.question, q.context, q.image_paths, q.created_at, "
            "j.filename FROM questions q LEFT JOIN jobs j ON q.job_id = j.id "
            "ORDER BY q.created_at DESC LIMIT 100"
        )
        questions = []
        for r in await cursor.fetchall():
            q = dict(r)
            q["image_paths"] = json.loads(q["image_paths"]) if q["image_paths"] else []
            questions.append(q)
    finally:
        await db.close()
    return templates.TemplateResponse("questions.html", {"request": request, "questions": questions})
