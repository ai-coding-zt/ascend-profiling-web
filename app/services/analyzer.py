"""分析服务 — 异步 subprocess 调用 analyze_profiling.py。"""

import asyncio
import json
import sys
from pathlib import Path

from app.config import ANALYSIS_SCRIPT, ANALYSIS_TIMEOUT


async def run_analysis(profiling_dir: Path, top_n: int = 30) -> dict:
    """运行分析脚本，返回 JSON 结果。

    Raises:
        TimeoutError: 分析超时
        RuntimeError: 脚本执行失败
    """
    cmd = [
        sys.executable,
        str(ANALYSIS_SCRIPT),
        "-d", str(profiling_dir),
        "--json",
        "-n", str(top_n),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=ANALYSIS_TIMEOUT,
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise TimeoutError(f"分析超时（{ANALYSIS_TIMEOUT}秒）")

    stderr_text = stderr.decode("utf-8", errors="replace").strip()

    if proc.returncode != 0:
        raise RuntimeError(f"分析脚本失败 (exit {proc.returncode}): {stderr_text}")

    stdout_text = stdout.decode("utf-8", errors="replace").strip()
    if not stdout_text:
        raise RuntimeError(f"分析脚本无输出。stderr: {stderr_text}")

    try:
        result = json.loads(stdout_text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"分析结果 JSON 解析失败: {e}\nstdout 前 500 字符: {stdout_text[:500]}")

    result["_scan_info"] = stderr_text
    return result


def find_trace_file(profiling_dir: Path) -> Path | None:
    """搜索 trace_view.json 文件。"""
    for p in profiling_dir.rglob("trace_view.json"):
        return p
    for p in profiling_dir.rglob("*.json"):
        if "trace" in p.name.lower():
            return p
    return None
