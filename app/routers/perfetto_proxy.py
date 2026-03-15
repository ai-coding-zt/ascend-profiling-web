"""Perfetto UI 完整反向代理 — 实现同源 iframe 嵌入。

必须代理所有请求的原因：
- Perfetto JS 使用 fetch() 加载 WASM、JSON 等资源
- fetch() 受 CORS 限制，而 ui.perfetto.dev 不返回 CORS 头
- 因此所有资源必须从同源（我们的服务器）加载

代理路径：
- /perfetto/          → index.html（入口）
- /perfetto/v53.0-xxx/... → 版本化资源（JS, WASM, CSS, fonts）
- /service_worker.js  → Service Worker 脚本
"""

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import Response

router = APIRouter(tags=["perfetto"])

PERFETTO_ORIGIN = "https://ui.perfetto.dev"

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=PERFETTO_ORIGIN,
            follow_redirects=True,
            timeout=60.0,
            limits=httpx.Limits(max_connections=20),
        )
    return _client


# Headers to strip from upstream response
_SKIP_HEADERS = {
    "transfer-encoding", "connection", "keep-alive",
    "x-frame-options", "content-security-policy",
    "content-encoding",  # we send raw bytes, not gzip
    "content-security-policy-report-only",
}


async def _proxy_get(upstream_path: str, query: str = "") -> Response:
    """转发 GET 请求到 ui.perfetto.dev。"""
    client = _get_client()
    url = upstream_path + (f"?{query}" if query else "")

    try:
        resp = await client.get(url)
    except httpx.HTTPError:
        return Response(content="Perfetto UI 暂时不可用", status_code=502)

    headers = {
        k: v for k, v in resp.headers.items()
        if k.lower() not in _SKIP_HEADERS
    }

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=headers,
    )


@router.get("/perfetto/{path:path}")
@router.get("/perfetto/")
@router.get("/perfetto")
async def perfetto_proxy(request: Request, path: str = ""):
    """代理 /perfetto/ 下的所有请求。"""
    upstream_path = f"/{path}" if path else "/"
    query = str(request.query_params) if request.query_params else ""
    return await _proxy_get(upstream_path, query)


@router.get("/service_worker.js")
async def perfetto_sw(request: Request):
    """代理 Perfetto Service Worker（绝对路径，不在 /perfetto/ 下）。"""
    query = str(request.query_params) if request.query_params else ""
    return await _proxy_get("/service_worker.js", query)
