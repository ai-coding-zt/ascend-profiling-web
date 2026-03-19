"""Q&A 路由 — 收集用户问题与截图，Agent 对话流式响应。"""

import asyncio
import json
import uuid

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from app.config import IMAGE_DIR, RESULT_DIR
from app.database import get_db
from app.models import ChatIn, QuestionIn, QuestionOut

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


def _build_report_context(report_data: dict) -> str:
    """将分析报告 JSON 转为结构化文本，供 AI 查阅全量分析数据。"""
    sections = []

    # ── 1. 算子分析 ──
    op_list = report_data.get("op_analysis", [])
    if op_list:
        op = op_list[0]
        lines = [
            f"## 算子分析",
            f"总算子数: {op.get('total_ops', 0)}, 总耗时: {op.get('total_time_us', 0)/1000:.1f}ms",
        ]
        cv = op.get("cube_vector")
        if cv:
            for k in ("cube", "vector", "aicpu"):
                if cv.get(k):
                    lines.append(f"  {k}: count={cv[k].get('count',0)}, time={cv[k].get('time_us',0)/1000:.1f}ms, pct={cv[k].get('pct',0):.1f}%")

        if op.get("top_ops"):
            lines.append(f"\n### Top-{len(op['top_ops'])} 算子")
            lines.append("| # | Type | Count | Total(us) | Pct | Mean(us) | Max(us) | Accelerator |")
            lines.append("|---|------|-------|-----------|-----|----------|---------|-------------|")
            for i, o in enumerate(op["top_ops"], 1):
                lines.append(
                    f"| {i} | {o.get('type','')} | {o.get('count',0)} | "
                    f"{o.get('total_us',0):.0f} | {o.get('pct',0):.1f}% | "
                    f"{o.get('mean_us',0):.0f} | {o.get('max_us',0):.0f} | "
                    f"{o.get('accelerator','')} |"
                )
        sections.append("\n".join(lines))

    # ── 2. 迭代时间 ──
    st_list = report_data.get("step_trace", [])
    if st_list:
        st = st_list[0]
        lines = [
            f"## 迭代时间分析",
            f"Step数: {st.get('step_count',0)}, 平均迭代: {st.get('mean_step_time_us',0)/1000:.1f}ms",
        ]
        bd = st.get("breakdown", {})
        if bd:
            lines.append("\n### 时间分解 (Rank 0)")
            lines.append("| 阶段 | 均值(us) | 占比 |")
            lines.append("|------|---------|------|")
            for phase, info in sorted(bd.items(), key=lambda x: x[1].get("pct", 0), reverse=True):
                if info.get("pct", 0) > 0.1:
                    lines.append(f"| {phase} | {info.get('mean_us',0):.0f} | {info.get('pct',0):.1f}% |")
        oa = st.get("overlap_analysis")
        if oa:
            lines.append(f"\n计算-通信重叠率: {oa.get('overlap_ratio',0):.1f}%")
        # Show per-rank breakdown summary if multi-rank
        if len(st_list) > 1:
            lines.append("\n### 各卡迭代时间")
            lines.append("| Device | Mean(ms) | Computing(us) | Comm(us) | Free(us) | Comp% | Comm% |")
            lines.append("|--------|----------|--------------|----------|----------|-------|-------|")
            for s in st_list:
                sbd = s.get("breakdown", {})
                comp = sbd.get("Computing", {}).get("mean_us", 0)
                comm = sbd.get("Communication(Not Overlapped)", sbd.get("Communication", {})).get("mean_us", 0)
                free = sbd.get("Free", {}).get("mean_us", 0)
                total = s.get("mean_step_time_us", 1)
                lines.append(
                    f"| {s.get('device_id','')} | {total/1000:.1f} | "
                    f"{comp:.0f} | {comm:.0f} | {free:.0f} | "
                    f"{comp/total*100:.1f}% | {comm/total*100:.1f}% |"
                )
        sections.append("\n".join(lines))

    # ── 3. 多卡分析 ──
    mr = report_data.get("multi_rank")
    if mr and mr.get("rank_count", 0) > 1:
        lines = [
            f"## 多卡分析 ({mr['rank_count']} 卡)",
            f"均值总时间: {mr.get('mean_total_us',0)/1000:.1f}ms, 最大偏差: {mr.get('max_deviation_pct',0):.3f}%",
        ]
        if mr.get("has_fast_slow"):
            lines.append(f"快慢卡现象: Comm占比差异 {mr.get('comm_pct_ratio',0):.1f}x")
            lines.append(f"根因: {mr.get('root_cause','unknown')}")
            if mr.get("dominant_collective"):
                lines.append(f"主要通信算子: {mr['dominant_collective']}")
            if mr.get("bottleneck_ranks"):
                lines.append(f"计算瓶颈卡: {mr['bottleneck_ranks']}")
            if mr.get("slow_ranks"):
                lines.append(f"等待卡(高Comm占比): {mr['slow_ranks']}")
            if mr.get("fast_ranks"):
                lines.append(f"快卡(低Comm占比): {mr['fast_ranks']}")

        lines.append("\n### 各卡详情")
        lines.append("| Device | Total(ms) | Comp% | Comm% | Free% |")
        lines.append("|--------|-----------|-------|-------|-------|")
        for r in mr.get("ranks", []):
            lines.append(
                f"| {r.get('device_id','')} | {r.get('total_us',0)/1000:.1f} | "
                f"{r.get('comp_pct',0):.1f}% | {r.get('comm_pct',0):.1f}% | "
                f"{r.get('free_pct',0):.1f}% |"
            )

        pi = mr.get("phase_imbalances", [])
        if pi:
            lines.append("\n### 阶段不均衡")
            for p in pi:
                lines.append(
                    f"- {p['phase']}: spread={p['spread_pct']:.1f}%, "
                    f"high={p.get('high_devices',[])}, low={p.get('low_devices',[])}"
                )
        sections.append("\n".join(lines))

    # ── 4. 通信分析 ──
    comm_list = report_data.get("communication", [])
    if comm_list:
        lines = [f"## 通信分析"]
        for ci, c in enumerate(comm_list):
            lines.append(f"\n### Rank {ci}")
            lines.append(f"总通信次数: {c.get('total_communications',0)}, 总耗时: {c.get('total_time_us',0)/1000:.1f}ms")
            for bt in c.get("by_type", []):
                bw_str = f", BW={bt['bandwidth_gbps']:.1f}GB/s" if bt.get("bandwidth_gbps") else ""
                lines.append(
                    f"  {bt['type']}: count={bt['count']}, "
                    f"time={bt['time_us']/1000:.1f}ms ({bt['pct']:.1f}%){bw_str}"
                )
        sections.append("\n".join(lines))

    # ── 5. 通信 Shape 分析 ──
    cs_list = report_data.get("comm_shape_analysis", [])
    if cs_list:
        lines = [f"## 通信 Shape 分析"]
        for cs in cs_list:
            for sg in cs.get("shape_groups", [])[:10]:
                if sg.get("pct", 0) > 1:
                    lines.append(
                        f"- {sg['name']}: shape={sg.get('shapes','')}, count={sg['count']}, "
                        f"mean={sg['mean_us']:.0f}us, CV={sg.get('cv',0):.2%}, pct={sg['pct']:.1f}%"
                    )
        if len(lines) > 1:
            sections.append("\n".join(lines))

    # ── 6. 重复结构 ──
    rs_list = report_data.get("repeated_structures", [])
    if rs_list:
        lines = [f"## 模型重复结构"]
        for s in rs_list:
            lines.append(
                f"\n### {s['name']} ({s['layer_count']} 层 × {s['ops_per_layer']} ops/层)"
            )
            lines.append(f"单层耗时: {s['single_layer_time_us']/1000:.1f}ms, "
                         f"总耗时: {s['total_time_us']/1000:.1f}ms, "
                         f"一致性: {s['match_pct']}%")
            # Include full per-layer op list
            ops = s.get("layer_ops", [])
            if ops:
                lines.append(f"\n单层算子列表 ({len(ops)} 个):")
                lines.append("| # | Type | Duration(us) | Pct | Accelerator | Name |")
                lines.append("|---|------|-------------|-----|-------------|------|")
                layer_total = s.get("single_layer_time_us", 1)
                for op in ops:
                    pct = op["duration_us"] / layer_total * 100 if layer_total > 0 else 0
                    lines.append(
                        f"| {op['idx']} | {op['type']} | {op['duration_us']:.1f} | "
                        f"{pct:.1f}% | {op.get('accelerator','')} | {op.get('name','')[:60]} |"
                    )
        sections.append("\n".join(lines))

    return "\n\n".join(sections)


@router.post("/chat")
async def chat_stream(req: ChatIn):
    """流式 Agent 对话 — 调用 Claude CLI (stream-json) 实现逐 token 流式响应。"""

    # Load full report JSON as structured context
    report_context = ""
    if req.job_id:
        result_path = RESULT_DIR / f"{req.job_id}.json"
        if result_path.exists():
            try:
                report_data = json.loads(result_path.read_text())
                report_context = _build_report_context(report_data)
            except Exception:
                pass

    # Build the prompt for Claude CLI
    system_prompt = (
        "你是一个昇腾 NPU Profiling 性能分析助手。"
        "用户正在查看一份 profiling 分析报告，请根据报告数据回答用户的问题。"
        "回答要简洁专业，使用中文。"
        "下方提供了完整的分析数据，你可以引用具体数值来回答。"
    )
    if report_context:
        # 当用户提供了选区上下文时，截断报告上下文以加快响应速度
        if req.context and len(report_context) > 8000:
            report_context = report_context[:8000] + "\n...(报告数据已截断，优先使用用户选区上下文)"
        system_prompt += f"\n\n# 当前报告的完整分析数据\n\n{report_context}"

    if req.context:
        system_prompt += f"\n\n# 用户提供的上下文信息\n\n{req.context}"

    user_message = req.message

    async def generate():
        try:
            proc = await asyncio.create_subprocess_exec(
                "claude", "-p",
                "--output-format", "stream-json",
                "--verbose",
                "--include-partial-messages",
                "--max-turns", "1",
                "--system-prompt", system_prompt,
                user_message,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            buffer = b""
            async for chunk in proc.stdout:
                buffer += chunk
                # Process complete JSON lines (each line is a complete JSON object)
                while b"\n" in buffer:
                    line_bytes, buffer = buffer.split(b"\n", 1)
                    line = line_bytes.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue

                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    evt_type = event.get("type")

                    # Token-level streaming: content_block_delta with text_delta
                    if evt_type == "stream_event":
                        inner = event.get("event", {})
                        if inner.get("type") == "content_block_delta":
                            delta = inner.get("delta", {})
                            if delta.get("type") == "text_delta" and delta.get("text"):
                                yield f"data: {json.dumps({'text': delta['text']}, ensure_ascii=False)}\n\n"

                    # Fallback: if not using stream events, handle assistant message
                    elif evt_type == "assistant":
                        msg = event.get("message", {})
                        for block in msg.get("content", []):
                            if block.get("type") == "text" and block.get("text"):
                                # Only yield if we haven't been streaming deltas
                                # (this is a duplicate of the full text)
                                pass

            # Process remaining buffer
            if buffer:
                line = buffer.decode("utf-8", errors="replace").strip()
                if line:
                    try:
                        event = json.loads(line)
                        if event.get("type") == "stream_event":
                            inner = event.get("event", {})
                            if inner.get("type") == "content_block_delta":
                                delta = inner.get("delta", {})
                                if delta.get("type") == "text_delta" and delta.get("text"):
                                    yield f"data: {json.dumps({'text': delta['text']}, ensure_ascii=False)}\n\n"
                    except json.JSONDecodeError:
                        pass

            await proc.wait()

            if proc.returncode != 0:
                stderr = await proc.stderr.read()
                err_text = stderr.decode("utf-8", errors="replace").strip()
                if err_text:
                    yield f"data: {json.dumps({'text': f'[错误] {err_text}'}, ensure_ascii=False)}\n\n"

        except FileNotFoundError:
            yield f"data: {json.dumps({'text': '[错误] 未找到 claude CLI，请确保已安装 Claude Code。'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'text': f'[错误] {str(e)}'}, ensure_ascii=False)}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
