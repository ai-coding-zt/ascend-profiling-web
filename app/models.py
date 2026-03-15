"""Pydantic 模型定义。"""

from pydantic import BaseModel


class JobOut(BaseModel):
    id: str
    filename: str
    status: str
    error: str | None = None
    trace_path: str | None = None
    summary: str | None = None
    created_at: str
    updated_at: str


class QuestionIn(BaseModel):
    job_id: str | None = None
    question: str
    context: str | None = None
    image_paths: list[str] = []


class QuestionOut(BaseModel):
    id: str
    job_id: str | None = None
    question: str
    context: str | None = None
    image_paths: list[str] = []
    created_at: str


class ChatIn(BaseModel):
    job_id: str | None = None
    message: str
    context: str | None = None
    image_paths: list[str] = []
