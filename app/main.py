"""FastAPI 应用入口。"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.database import init_db
from app.routers import jobs, pages, perfetto_proxy, questions, report, trace, upload
from app.services.cleanup import cleanup_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    cleanup_task = asyncio.create_task(cleanup_loop())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="昇腾 Profiling 分析平台", lifespan=lifespan)

# 静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/data/images", StaticFiles(directory="data/images"), name="images")

# API 路由
app.include_router(upload.router)
app.include_router(jobs.router)
app.include_router(report.router)
app.include_router(trace.router)
app.include_router(questions.router)
app.include_router(perfetto_proxy.router)

# 页面路由
app.include_router(pages.router)
