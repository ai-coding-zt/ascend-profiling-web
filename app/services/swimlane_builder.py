"""泳道数据构建器 — 扫描多卡 trace_view.json 并合并为统一泳道结构。"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# trace 文件搜索模式（使用递归通配符覆盖深层嵌套目录）
_TRACE_PATTERNS = [
    "**/trace_view.json",
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
    """从文件路径推断 rank 标识。

    实际路径示例:
    PROF_xxx/localhost.localdomain_268228_20260205_ascend_pt/ASCEND_PROFILER_OUTPUT/trace_view.json
    rank_0/trace_view.json
    device_0/trace_view.json
    trace_view.json
    """
    rel = trace_path.relative_to(workdir)
    parts = rel.parts  # 不含文件名本身，parts[-1] 是 "trace_view.json"

    # 遍历所有目录层级，尝试匹配已知模式
    for part in parts[:-1]:
        lower = part.lower()
        # rank_0, device_0 等直接模式
        for prefix in ("rank_", "device_"):
            if lower.startswith(prefix):
                suffix = part[len(prefix):]
                digits = ""
                for ch in suffix:
                    if ch.isdigit():
                        digits += ch
                    else:
                        break
                if digits:
                    return f"rank{int(digits)}"

    # 对于 localhost.localdomain_{pid}_{ts}_ascend_pt 这种格式，
    # 用 pid 作为标识（同一机器上不同进程代表不同 rank）
    for part in parts[:-1]:
        if "_ascend_pt" in part:
            # 提取 pid: hostname_PID_timestamp_ascend_pt
            segments = part.split("_")
            for i, seg in enumerate(segments):
                if seg.isdigit() and len(seg) >= 3:
                    return f"pid{seg}"

    # 退回使用父目录名作为标识
    if len(parts) > 1:
        return parts[-2].replace(" ", "_")[:20]

    return "rank0"


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


# 事件数量上限 — 超过此数量时自动过滤短事件
_MAX_EVENTS = 200_000


def build_swimlane_data(workdir: Path) -> dict:
    """扫描 workdir 下所有 rank 的 trace 文件，构建统一泳道数据。

    当事件总量超过 _MAX_EVENTS 时，自动过滤掉短事件以保持前端性能。

    返回值格式:
    {
        "timeRange": {"start": 0, "end": ...},
        "unit": "us",
        "lanes": [...],
        "categories": {...},
        "totalOriginal": int,
        "filtered": bool,
        "minDurFilter": float
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

    # 3. 智能过滤 — 如果事件总数过多，逐步提高 dur 门槛
    total_events = sum(
        len(evts) for sublane_map in raw_lanes.values() for evts in sublane_map.values()
    )
    total_original = total_events
    min_dur_filter = 0.0
    filtered = False

    if total_events > _MAX_EVENTS:
        # 收集所有事件的 dur 值，找到合适的过滤阈值
        all_durs = []
        for sublane_map in raw_lanes.values():
            for evts in sublane_map.values():
                all_durs.extend(e["dur"] for e in evts)
        all_durs.sort()
        # 需要保留 _MAX_EVENTS 个事件，即去掉最短的 N 个
        cut_idx = len(all_durs) - _MAX_EVENTS
        if cut_idx > 0 and cut_idx < len(all_durs):
            min_dur_filter = all_durs[cut_idx]
            filtered = True
            # 过滤
            for sublane_map in raw_lanes.values():
                for key in sublane_map:
                    sublane_map[key] = [e for e in sublane_map[key] if e["dur"] >= min_dur_filter]
            logger.info(
                "事件过滤: %d → %d (dur >= %.2f us)",
                total_original, _MAX_EVENTS, min_dur_filter,
            )

    # 4. 时间归一化 + 排序 + 构建输出结构
    lanes = []
    collected_cats: set[str] = set()

    for rank_id in sorted(raw_lanes.keys()):
        sublane_map = raw_lanes[rank_id]
        sublanes = []

        for sublane_key in sorted(sublane_map.keys()):
            events = sublane_map[sublane_key]
            if not events:
                continue  # 过滤后可能为空
            # 归一化时间戳
            for e in events:
                e["ts"] = round(e["ts"] - global_min_ts, 2)
                e["dur"] = round(e["dur"], 2)
                collected_cats.add(e["cat"])
            # 去掉 args 以减小 JSON 体积
            for e in events:
                e.pop("args", None)
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

        if not sublanes:
            continue

        # rank 标签 — 按顺序编号
        rank_idx = len(lanes)
        if rank_id.startswith("rank") and rank_id[4:].isdigit():
            label = f"Device {rank_id[4:]}"
        elif rank_id.startswith("pid"):
            label = f"Device {rank_idx} (PID {rank_id[3:]})"
        else:
            label = f"Device {rank_idx}"

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
        "totalOriginal": total_original,
        "filtered": filtered,
        "minDurFilter": round(min_dur_filter, 2),
    }
