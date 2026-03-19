"""报告数据路由。"""

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.config import RESULT_DIR
from app.database import get_db

router = APIRouter(prefix="/api", tags=["report"])


@router.get("/jobs/{job_id}/report")
async def get_report(job_id: str):
    result_path = RESULT_DIR / f"{job_id}.json"
    if not result_path.exists():
        raise HTTPException(404, "分析结果不存在")
    data = json.loads(result_path.read_text(encoding="utf-8"))
    return data


@router.get("/jobs/{job_id}/export-markdown")
async def export_markdown(job_id: str):
    """导出分析报告为 Markdown 格式。"""
    result_path = RESULT_DIR / f"{job_id}.json"
    if not result_path.exists():
        raise HTTPException(404, "分析结果不存在")

    data = json.loads(result_path.read_text(encoding="utf-8"))

    # 获取任务信息
    filename = job_id
    try:
        db = await get_db()
        cursor = await db.execute("SELECT filename, created_at FROM jobs WHERE id=?", (job_id,))
        row = await cursor.fetchone()
        if row:
            filename = row["filename"]
        await db.close()
    except Exception:
        pass

    md = _build_export_markdown(data, filename)
    return Response(
        content=md.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{job_id}_report.md"'},
    )


def _build_export_markdown(data: dict, filename: str) -> str:
    """将分析数据构建为完整的 Markdown 报告。"""
    lines = []
    lines.append(f"# 昇腾 Profiling 分析报告")
    lines.append(f"")
    lines.append(f"- **文件**: {filename}")
    lines.append(f"- **导出时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"")

    # ── 算子分析 ──
    op_list = data.get("op_analysis", [])
    if op_list:
        op = op_list[0]
        lines.append(f"## 算子分析")
        lines.append(f"")
        lines.append(f"- 总算子数: **{op.get('total_ops', 0)}**")
        lines.append(f"- 总耗时: **{op.get('total_time_us', 0)/1000:.1f} ms**")
        lines.append(f"")

        cv = op.get("cube_vector")
        if cv:
            lines.append(f"### 算子类型分布")
            lines.append(f"")
            lines.append(f"| 类型 | 数量 | 耗时(ms) | 占比 |")
            lines.append(f"|------|------|----------|------|")
            for k in ("cube", "vector", "aicpu"):
                if cv.get(k):
                    c = cv[k]
                    lines.append(f"| {k.title()} | {c.get('count',0)} | {c.get('time_us',0)/1000:.1f} | {c.get('pct',0):.1f}% |")
            lines.append(f"")

        if op.get("top_ops"):
            lines.append(f"### Top 算子 (按耗时排序)")
            lines.append(f"")
            lines.append("| # | 算子类型 | 数量 | 总耗时(μs) | 占比 | 均值(μs) | 最大(μs) | 加速器 |")
            lines.append("|---|---------|------|-----------|------|---------|---------|--------|")
            for i, o in enumerate(op["top_ops"], 1):
                lines.append(
                    f"| {i} | {o.get('type','')} | {o.get('count',0)} | "
                    f"{o.get('total_us',0):.0f} | {o.get('pct',0):.1f}% | "
                    f"{o.get('mean_us',0):.0f} | {o.get('max_us',0):.0f} | "
                    f"{o.get('accelerator','')} |"
                )
            lines.append(f"")

    # ── 迭代时间 ──
    st_list = data.get("step_trace", [])
    if st_list:
        st = st_list[0]
        lines.append(f"## 迭代时间分析")
        lines.append(f"")
        lines.append(f"- Step 数: **{st.get('step_count',0)}**")
        lines.append(f"- 平均迭代时间: **{st.get('mean_step_time_us',0)/1000:.1f} ms**")
        lines.append(f"")

        bd = st.get("breakdown", {})
        if bd:
            lines.append(f"### 时间分解")
            lines.append(f"")
            lines.append("| 阶段 | 均值(μs) | 占比 |")
            lines.append("|------|---------|------|")
            for phase, info in sorted(bd.items(), key=lambda x: x[1].get("pct", 0), reverse=True):
                if info.get("pct", 0) > 0.1:
                    lines.append(f"| {phase} | {info.get('mean_us',0):.0f} | {info.get('pct',0):.1f}% |")
            lines.append(f"")

        oa = st.get("overlap_analysis")
        if oa:
            lines.append(f"- 计算-通信重叠率: **{oa.get('overlap_ratio',0):.1f}%**")
            lines.append(f"")

        if len(st_list) > 1:
            lines.append(f"### 各卡迭代时间")
            lines.append(f"")
            lines.append("| 设备 | 均值(ms) | 计算(μs) | 通信(μs) | 空闲(μs) | 计算% | 通信% |")
            lines.append("|------|---------|---------|---------|---------|-------|-------|")
            for s in st_list:
                sbd = s.get("breakdown", {})
                comp = sbd.get("Computing", {}).get("mean_us", 0)
                comm = sbd.get("Communication(Not Overlapped)", sbd.get("Communication", {})).get("mean_us", 0)
                free = sbd.get("Free", {}).get("mean_us", 0)
                total = s.get("mean_step_time_us", 1)
                lines.append(
                    f"| Device {s.get('device_id','')} | {total/1000:.1f} | "
                    f"{comp:.0f} | {comm:.0f} | {free:.0f} | "
                    f"{comp/total*100:.1f}% | {comm/total*100:.1f}% |"
                )
            lines.append(f"")

    # ── 通信分析 ──
    comm_list = data.get("communication", [])
    if comm_list:
        comm = comm_list[0]
        lines.append(f"## 通信分析")
        lines.append(f"")
        if comm.get("total_comm_time_us"):
            lines.append(f"- 总通信耗时: **{comm['total_comm_time_us']/1000:.1f} ms**")
        if comm.get("top_collectives"):
            lines.append(f"")
            lines.append(f"### Top 通信算子")
            lines.append(f"")
            lines.append("| 算子 | 数量 | 总耗时(μs) | 占比 | 均值(μs) |")
            lines.append("|------|------|-----------|------|---------|")
            for c in comm["top_collectives"]:
                lines.append(
                    f"| {c.get('name','')} | {c.get('count',0)} | "
                    f"{c.get('total_us',0):.0f} | {c.get('pct',0):.1f}% | "
                    f"{c.get('mean_us',0):.0f} |"
                )
            lines.append(f"")

    # ── 多卡分析 ──
    mr = data.get("multi_rank")
    if mr and mr.get("rank_count", 0) > 1:
        lines.append(f"## 多卡分析 ({mr['rank_count']} 卡)")
        lines.append(f"")
        lines.append(f"- 均值总时间: **{mr.get('mean_total_us',0)/1000:.1f} ms**")
        lines.append(f"- 最大偏差: **{mr.get('max_deviation_pct',0):.3f}%**")
        if mr.get("has_fast_slow"):
            lines.append(f"- 快慢卡现象: 通信占比差异 {mr.get('comm_pct_ratio',0):.1f}x")
            lines.append(f"- 根因: {mr.get('root_cause','')}")
        lines.append(f"")

    # ── 重复结构 ──
    rs = data.get("repeated_structures")
    if rs and isinstance(rs, list) and len(rs) > 0:
        lines.append(f"## 重复结构检测")
        lines.append(f"")
        for s in rs[:5]:
            layer_count = s.get("layer_count", 0)
            lines.append(f"### {s.get('name', '结构')} (重复 {layer_count} 层)")
            lines.append(f"- 类型: {s.get('type', '')}")
            lines.append(f"- 单层耗时: {s.get('single_layer_time_us', 0)/1000:.2f} ms")
            lines.append(f"- 总耗时: {s.get('total_time_us', 0)/1000:.2f} ms")
            if s.get("ops_per_layer"):
                lines.append(f"- 每层算子数: {s['ops_per_layer']}")
            if s.get("match_pct"):
                lines.append(f"- 匹配度: {s['match_pct']:.1f}%")
            if s.get("layer_ops"):
                op_names = [op if isinstance(op, str) else op.get("name", "") for op in s["layer_ops"][:10]]
                lines.append(f"- 包含算子: {', '.join(op_names)}")
            lines.append(f"")

    lines.append(f"---")
    lines.append(f"*由昇腾 Profiling 分析平台自动生成*")

    return "\n".join(lines)
