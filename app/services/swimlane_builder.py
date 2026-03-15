"""泳道数据构建器 — 扫描多卡 trace_view.json 并合并为统一泳道结构。"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# trace 文件搜索模式
_TRACE_PATTERNS = [
    "*/trace_view.json",
    "PROF_*/trace_view.json",
    "device_*/trace_view.json",
    "rank_*/trace_view.json",
    "trace_view.json",
]

# 类别颜色映射
_CATEGORIES = {
    "cpu_op": {"color": "#3498db", "label": "CPU 算子"},
    "kernel": {"color": "#4ecdc4", "label": "设备算子"},
    "communication": {"color": "#f39c12", "label": "通信"},
    "hccl": {"color": "#f39c12", "label": "HCCL 通信"},
    "runtime": {"color": "#9b59b6", "label": "Runtime"},
    "memory": {"color": "#e74c3c", "label": "内存"},
    "overlap": {"color": "#2ecc71", "label": "计算通信重叠"},
    "other": {"color": "#95a5a6", "label": "其他"},
}


def _guess_rank(trace_path: Path, workdir: Path) -> str:
    """从文件路径推断 rank 编号。"""
    rel = trace_path.relative_to(workdir)
    parent = rel.parts[0] if len(rel.parts) > 1 else ""
    # 尝试从目录名提取数字后缀
    for prefix in ("rank_", "device_", "PROF_"):
        if parent.startswith(prefix):
            suffix = parent[len(prefix):]
            # PROF_000001_... 格式取第一段数字
            digits = ""
            for ch in suffix:
                if ch.isdigit():
                    digits += ch
                else:
                    break
            if digits:
                return f"rank{int(digits)}"
    # 如果只有一个 trace 文件，默认 rank0
    return f"rank0"


def _classify_event(evt: dict) -> str:
    """根据事件属性分类。"""
    cat = evt.get("cat", "").lower()
    name = evt.get("name", "").lower()

    if "hccl" in cat or "hccl" in name or "allreduce" in name or "allgather" in name:
        return "communication"
    if "kernel" in cat or "compute" in cat:
        return "kernel"
    if "cpu" in cat or "cpu_op" in cat:
        return "cpu_op"
    if "runtime" in cat:
        return "runtime"
    if "memory" in cat or "mem" in cat:
        return "memory"
    if "overlap" in cat:
        return "overlap"
    if cat:
        return cat  # 保留原始分类
    return "other"


def build_swimlane_data(workdir: Path) -> dict:
    """扫描 workdir 下所有 rank 的 trace 文件，构建统一泳道数据。

    返回值格式:
    {
        "timeRange": {"start": 0, "end": ...},
        "unit": "us",
        "lanes": [...],
        "categories": {...}
    }
    """
    # 1. 发现所有 trace 文件
    trace_files: list[tuple[str, Path]] = []
    seen_paths: set[str] = set()

    for pattern in _TRACE_PATTERNS:
        for p in sorted(workdir.glob(pattern)):
            real = str(p.resolve())
            if real in seen_paths:
                continue
            seen_paths.add(real)
            rank_id = _guess_rank(p, workdir)
            # 如果同一 rank 已有文件，添加后缀
            existing = [r for r, _ in trace_files if r == rank_id]
            if existing:
                rank_id = f"{rank_id}_{len(existing)}"
            trace_files.append((rank_id, p))

    if not trace_files:
        return {
            "timeRange": {"start": 0, "end": 0},
            "unit": "us",
            "lanes": [],
            "categories": _CATEGORIES,
        }

    # 2. 解析所有 trace 文件
    global_min_ts = float("inf")
    global_max_ts = 0.0
    # rank_id -> {sublane_key -> [events]}
    raw_lanes: dict[str, dict[str, list[dict]]] = {}
    # B/E 配对缓冲
    pending_be: dict[str, dict] = {}  # key -> B event

    for rank_id, trace_path in trace_files:
        try:
            with open(trace_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("跳过无法解析的 trace 文件 %s: %s", trace_path, e)
            continue

        events = data if isinstance(data, list) else data.get("traceEvents", [])
        if not events:
            continue

        if rank_id not in raw_lanes:
            raw_lanes[rank_id] = {}

        for evt in events:
            ph = evt.get("ph")
            ts = evt.get("ts")
            if ts is None:
                continue

            ts = float(ts)
            pid = evt.get("pid", 0)
            tid = evt.get("tid", 0)
            sublane_key = f"{rank_id}_p{pid}_t{tid}"

            if ph == "X":
                # 完整事件
                dur = float(evt.get("dur", 0))
                cat = _classify_event(evt)
                out_evt = {
                    "ts": ts,
                    "dur": dur,
                    "name": evt.get("name", ""),
                    "cat": cat,
                }
                if evt.get("args"):
                    out_evt["args"] = evt["args"]
                raw_lanes[rank_id].setdefault(sublane_key, []).append(out_evt)
                global_min_ts = min(global_min_ts, ts)
                global_max_ts = max(global_max_ts, ts + dur)

            elif ph == "B":
                # 开始事件 — 缓存等待配对
                be_key = f"{sublane_key}_{evt.get('name', '')}_{pid}_{tid}"
                pending_be[be_key] = evt

            elif ph == "E":
                # 结束事件 — 配对
                be_key = f"{sublane_key}_{evt.get('name', '')}_{pid}_{tid}"
                b_evt = pending_be.pop(be_key, None)
                if b_evt:
                    b_ts = float(b_evt.get("ts", ts))
                    dur = ts - b_ts
                    if dur < 0:
                        dur = 0
                    cat = _classify_event(b_evt)
                    out_evt = {
                        "ts": b_ts,
                        "dur": dur,
                        "name": b_evt.get("name", ""),
                        "cat": cat,
                    }
                    args = b_evt.get("args", {})
                    if evt.get("args"):
                        args.update(evt["args"])
                    if args:
                        out_evt["args"] = args
                    raw_lanes[rank_id].setdefault(sublane_key, []).append(out_evt)
                    global_min_ts = min(global_min_ts, b_ts)
                    global_max_ts = max(global_max_ts, b_ts + dur)

    if global_min_ts == float("inf"):
        global_min_ts = 0.0

    # 3. 时间归一化 + 排序 + 构建输出结构
    lanes = []
    collected_cats: set[str] = set()

    for rank_id in sorted(raw_lanes.keys()):
        sublane_map = raw_lanes[rank_id]
        sublanes = []

        for sublane_key in sorted(sublane_map.keys()):
            events = sublane_map[sublane_key]
            # 归一化时间戳
            for e in events:
                e["ts"] = round(e["ts"] - global_min_ts, 2)
                e["dur"] = round(e["dur"], 2)
                collected_cats.add(e["cat"])
            # 按 ts 排序（前端二分查找依赖）
            events.sort(key=lambda e: e["ts"])
            # 从 sublane_key 提取可读标签
            parts = sublane_key.split("_")
            label = sublane_key
            if len(parts) >= 3:
                label = f"PID {parts[-2][1:]} / TID {parts[-1][1:]}"
            sublanes.append({
                "id": sublane_key,
                "label": label,
                "events": events,
            })

        # rank 标签
        rank_num = rank_id.replace("rank", "")
        label = f"Device {rank_num}" if rank_num.isdigit() else rank_id

        lanes.append({
            "id": rank_id,
            "label": label,
            "sublanes": sublanes,
        })

    total_end = round(global_max_ts - global_min_ts, 2)

    # 构建类别映射（仅包含实际出现的类别）
    categories = {}
    for cat in sorted(collected_cats):
        if cat in _CATEGORIES:
            categories[cat] = _CATEGORIES[cat]
        else:
            categories[cat] = {"color": "#95a5a6", "label": cat}

    return {
        "timeRange": {"start": 0, "end": total_end},
        "unit": "us",
        "lanes": lanes,
        "categories": categories,
    }
