"""泳道数据构建器 — 扫描多卡 trace_view.json，按模块分组合并为统一泳道结构。

模块分组（用于多卡对比）:
  1. Ascend Hardware — NPU 设备算子（按 Stream 分子泳道）
  2. Communication  — HCCL 通信 + CCU
  3. Overlap Analysis — 计算/通信重叠分析
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# 事件数量上限
_MAX_EVENTS = 200_000

# 模块定义：process_name → module_id
_MODULE_MAP = {
    "Ascend Hardware": "ascend_hw",
    "Communication": "communication",
    "CCU": "communication",
    "Overlap Analysis": "overlap",
}

# 模块显示信息
_MODULE_INFO = {
    "ascend_hw": {"label": "Ascend Hardware", "color": "#4ecdc4", "order": 0},
    "communication": {"label": "Communication", "color": "#f39c12", "order": 1},
    "overlap": {"label": "Overlap Analysis", "color": "#2ecc71", "order": 2},
}

# 类别颜色映射
_CATEGORIES = {
    "ascend_hw": {"color": "#4ecdc4", "label": "设备算子"},
    "communication": {"color": "#f39c12", "label": "通信"},
    "overlap_computing": {"color": "#3498db", "label": "计算"},
    "overlap_comm": {"color": "#f39c12", "label": "通信"},
    "overlap_comm_no": {"color": "#e74c3c", "label": "通信(未重叠)"},
    "overlap_free": {"color": "#95a5a6", "label": "空闲"},
    "other": {"color": "#9b59b6", "label": "其他"},
}


def _guess_rank_index(trace_path: Path, workdir: Path) -> int:
    """从文件路径推断 rank 序号（用于排序和标签）。"""
    rel = trace_path.relative_to(workdir)
    parts = rel.parts
    for part in parts[:-1]:
        lower = part.lower()
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
                    return int(digits)
    # 对于 hostname_{pid}_{ts}_ascend_pt 格式，用发现顺序
    return -1  # 标记为需要后续分配


def _classify_overlap_thread(thread_name: str) -> str:
    """Overlap Analysis 子线程分类。"""
    tn = thread_name.lower()
    if "not overlapped" in tn or "not_overlapped" in tn:
        return "overlap_comm_no"
    if "communication" in tn:
        return "overlap_comm"
    if "computing" in tn:
        return "overlap_computing"
    if "free" in tn:
        return "overlap_free"
    return "other"


def build_swimlane_data(workdir: Path) -> dict:
    """按模块分组构建泳道数据，每个模块下按 rank 排列子泳道。

    输出结构:
    lanes = [
      { id: "ascend_hw",     label: "Ascend Hardware",  sublanes: [Device 0 Stream 7, Device 0 Stream 12, Device 1 Stream 7, ...] },
      { id: "communication", label: "Communication",    sublanes: [Device 0 Group..., Device 1 Group..., ...] },
      { id: "overlap",       label: "Overlap Analysis",  sublanes: [Device 0 Computing, Device 0 Communication, ...] },
    ]
    """
    # 1. 发现所有 trace 文件
    trace_files: list[tuple[int, Path]] = []
    seen_paths: set[str] = set()

    for p in sorted(workdir.glob("**/trace_view.json")):
        real = str(p.resolve())
        if real in seen_paths:
            continue
        seen_paths.add(real)
        rank_idx = _guess_rank_index(p, workdir)
        trace_files.append((rank_idx, p))

    if not trace_files:
        return {"timeRange": {"start": 0, "end": 0}, "unit": "us", "lanes": [], "categories": _CATEGORIES}

    # 分配自动 rank 序号
    auto_idx = 0
    assigned: list[tuple[int, Path]] = []
    for idx, p in trace_files:
        if idx < 0:
            idx = auto_idx
        auto_idx = max(auto_idx, idx) + 1
        assigned.append((idx, p))
    trace_files = sorted(assigned, key=lambda x: x[0])

    # 2. 解析所有 trace 文件，提取进程元数据和事件
    global_min_ts = float("inf")
    global_max_ts = 0.0

    # module_id -> [(rank_idx, sublane_label, [events])]
    module_sublanes: dict[str, list[tuple[int, str, list[dict]]]] = {}
    total_original = 0

    for rank_idx, trace_path in trace_files:
        try:
            with open(trace_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("跳过无法解析的 trace 文件 %s: %s", trace_path, e)
            continue

        events_list = data if isinstance(data, list) else data.get("traceEvents", [])
        if not events_list:
            continue

        # 提取进程/线程元数据
        pid_to_process: dict[int, str] = {}  # pid -> process_name
        tid_to_thread: dict[tuple[int, int], str] = {}  # (pid,tid) -> thread_name

        for evt in events_list:
            if evt.get("ph") != "M":
                continue
            pid = evt.get("pid", 0)
            args = evt.get("args", {})
            if evt.get("name") == "process_name":
                pid_to_process[pid] = args.get("name", "")
            elif evt.get("name") == "thread_name":
                tid = evt.get("tid", 0)
                tid_to_thread[(pid, tid)] = args.get("name", "")

        # 按 pid 分组收集事件
        pid_events: dict[int, dict[int, list[dict]]] = {}  # pid -> tid -> [events]
        pending_be: dict[str, dict] = {}

        for evt in events_list:
            ph = evt.get("ph")
            ts = evt.get("ts")
            if ts is None or ph not in ("X", "B", "E"):
                continue

            ts = float(ts)
            pid = evt.get("pid", 0)
            tid = evt.get("tid", 0)

            if ph == "X":
                dur = float(evt.get("dur", 0))
                out_evt = {"ts": ts, "dur": dur, "name": evt.get("name", "")}
                # 保留有用的 args 字段（Input Dims/Type 用于 dtype+shape 展示）
                raw_args = evt.get("args")
                if raw_args and isinstance(raw_args, dict):
                    kept = {}
                    for k in ("Input Dims", "Input type", "Task Type", "Task Id"):
                        if k in raw_args:
                            kept[k] = str(raw_args[k])
                    if kept:
                        out_evt["args"] = kept
                pid_events.setdefault(pid, {}).setdefault(tid, []).append(out_evt)
                global_min_ts = min(global_min_ts, ts)
                global_max_ts = max(global_max_ts, ts + dur)
                total_original += 1
            elif ph == "B":
                be_key = f"{rank_idx}_{pid}_{tid}_{evt.get('name', '')}"
                pending_be[be_key] = evt
            elif ph == "E":
                be_key = f"{rank_idx}_{pid}_{tid}_{evt.get('name', '')}"
                b_evt = pending_be.pop(be_key, None)
                if b_evt:
                    b_ts = float(b_evt.get("ts", ts))
                    dur = max(0, ts - b_ts)
                    out_evt = {"ts": b_ts, "dur": dur, "name": b_evt.get("name", "")}
                    raw_args = b_evt.get("args")
                    if raw_args and isinstance(raw_args, dict):
                        kept = {}
                        for k in ("Input Dims", "Input type", "Task Type", "Task Id"):
                            if k in raw_args:
                                kept[k] = str(raw_args[k])
                        if kept:
                            out_evt["args"] = kept
                    pid_events.setdefault(pid, {}).setdefault(tid, []).append(out_evt)
                    global_min_ts = min(global_min_ts, b_ts)
                    global_max_ts = max(global_max_ts, b_ts + dur)
                    total_original += 1

        # 将事件分配到模块
        for pid, tid_map in pid_events.items():
            proc_name = pid_to_process.get(pid, "")
            module_id = _MODULE_MAP.get(proc_name)
            if not module_id:
                continue  # 跳过 Python/CANN 等 CPU 侧事件

            for tid, evts in sorted(tid_map.items()):
                if not evts:
                    continue
                thread_name = tid_to_thread.get((pid, tid), f"Thread {tid}")

                # 为事件添加类别标记
                if module_id == "overlap":
                    cat = _classify_overlap_thread(thread_name)
                    for e in evts:
                        e["cat"] = cat
                elif module_id == "communication":
                    for e in evts:
                        e["cat"] = "communication"
                else:
                    for e in evts:
                        e["cat"] = "ascend_hw"

                sublane_label = f"Device {rank_idx} / {thread_name}"
                module_sublanes.setdefault(module_id, []).append(
                    (rank_idx, sublane_label, evts)
                )

    if global_min_ts == float("inf"):
        global_min_ts = 0.0

    # 3. 智能过滤
    all_events_flat = []
    for sublane_list in module_sublanes.values():
        for _, _, evts in sublane_list:
            all_events_flat.extend(evts)

    min_dur_filter = 0.0
    filtered = False

    if len(all_events_flat) > _MAX_EVENTS:
        all_durs = sorted(e["dur"] for e in all_events_flat)
        cut_idx = len(all_durs) - _MAX_EVENTS
        if 0 < cut_idx < len(all_durs):
            min_dur_filter = all_durs[cut_idx]
            filtered = True
            for sublane_list in module_sublanes.values():
                for i, (rank_idx, label, evts) in enumerate(sublane_list):
                    sublane_list[i] = (rank_idx, label, [e for e in evts if e["dur"] >= min_dur_filter])
            logger.info("事件过滤: %d → ≤%d (dur >= %.2f us)", total_original, _MAX_EVENTS, min_dur_filter)

    # 4. 时间归一化 + 排序 + 构建输出
    lanes = []
    collected_cats: set[str] = set()

    for module_id in sorted(_MODULE_INFO.keys(), key=lambda m: _MODULE_INFO[m]["order"]):
        if module_id not in module_sublanes:
            continue

        sublane_list = module_sublanes[module_id]
        # 按 rank_idx 排序，保证多卡对齐
        sublane_list.sort(key=lambda x: (x[0], x[1]))

        sublanes = []
        for rank_idx, label, evts in sublane_list:
            if not evts:
                continue
            for e in evts:
                e["ts"] = round(e["ts"] - global_min_ts, 2)
                e["dur"] = round(e["dur"], 2)
                collected_cats.add(e.get("cat", module_id))
            evts.sort(key=lambda e: e["ts"])
            sublanes.append({
                "id": f"{module_id}_r{rank_idx}_{label}",
                "label": label,
                "events": evts,
            })

        if not sublanes:
            continue

        info = _MODULE_INFO[module_id]
        lanes.append({
            "id": module_id,
            "label": info["label"],
            "sublanes": sublanes,
        })

    total_end = round(global_max_ts - global_min_ts, 2)
    total_retained = sum(len(s["events"]) for l in lanes for s in l["sublanes"])

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
        "totalRetained": total_retained,
        "filtered": filtered,
        "minDurFilter": round(min_dur_filter, 2),
    }
