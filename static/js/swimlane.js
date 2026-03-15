/* ─── Canvas 泳道渲染器 — 多卡 Trace 可视化 ─── */

(function () {
    'use strict';

    // ─── 布局常量 ───
    const LANE_HEADER_WIDTH = 160;
    const SUBLANE_HEIGHT = 28;
    const LANE_GAP = 8;
    const LANE_TITLE_HEIGHT = 26;
    const TIME_AXIS_HEIGHT = 32;
    const MIN_TEXT_WIDTH = 60;
    const TOOLTIP_PAD = 8;
    const SCROLL_SENSITIVITY = 1.2;
    const ZOOM_FACTOR = 1.15;

    // ─── 颜色 hash 微调 ───
    function hashStr(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        }
        return h;
    }

    function adjustColor(baseHex, name) {
        // 微调亮度/色相
        const h = Math.abs(hashStr(name));
        const adj = (h % 40) - 20; // -20..+19
        const r = parseInt(baseHex.slice(1, 3), 16);
        const g = parseInt(baseHex.slice(3, 5), 16);
        const b = parseInt(baseHex.slice(5, 7), 16);
        const clamp = v => Math.max(30, Math.min(230, v + adj));
        return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
    }

    // ─── 二分查找：找到 ts >= targetTs 的第一个事件索引 ───
    function bisectLeft(events, targetTs) {
        let lo = 0, hi = events.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (events[mid].ts < targetTs) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    // ─── 时间格式化 ───
    function formatTime(us) {
        if (us < 0) us = 0;
        if (us < 1) return us.toFixed(3) + ' ns×1000';
        if (us < 1000) return us.toFixed(1) + ' μs';
        if (us < 1000000) return (us / 1000).toFixed(2) + ' ms';
        return (us / 1000000).toFixed(3) + ' s';
    }

    // ─── 自适应时间刻度 ───
    function niceStep(range, maxTicks) {
        const rough = range / maxTicks;
        const mag = Math.pow(10, Math.floor(Math.log10(rough)));
        const norm = rough / mag;
        let step;
        if (norm < 1.5) step = mag;
        else if (norm < 3.5) step = 2 * mag;
        else if (norm < 7.5) step = 5 * mag;
        else step = 10 * mag;
        return step;
    }

    // ─── SwimlaneViewer 主类 ───
    class SwimlaneViewer {
        constructor(container, data) {
            this.container = container;
            this.data = data;
            this.lanes = data.lanes || [];
            this.categories = data.categories || {};

            // 视口状态
            this.viewportStart = data.timeRange.start;
            this.viewportEnd = data.timeRange.end || 1;
            this.scrollY = 0;

            // 选区状态
            this.selectionRect = null;    // {x1,y1,x2,y2} 屏幕坐标
            this.selectedEvents = [];
            this.selectionMode = false;

            // hover 状态
            this.hoverEvent = null;
            this.hoverPos = null; // {x, y}

            // 拖拽状态
            this._dragging = false;
            this._dragStart = null;
            this._dragButton = -1;

            // 预计算子泳道 Y 偏移
            this._layoutSublanes();

            // 创建三层 Canvas
            this._createCanvases();

            // 绑定事件
            this._bindEvents();

            // 首次渲染
            this._scheduleRender();
        }

        // ─── 布局计算 ───
        _layoutSublanes() {
            this._sublaneLayout = []; // [{lane, sublane, y, height}]
            let y = TIME_AXIS_HEIGHT;
            for (const lane of this.lanes) {
                const laneStart = y;
                y += LANE_TITLE_HEIGHT;
                for (const sub of lane.sublanes) {
                    this._sublaneLayout.push({
                        lane,
                        sublane: sub,
                        y: y,
                        height: SUBLANE_HEIGHT,
                    });
                    y += SUBLANE_HEIGHT;
                }
                y += LANE_GAP;
            }
            this._totalHeight = y;
        }

        _createCanvases() {
            this.container.innerHTML = '';
            this.container.style.overflow = 'hidden';
            this.container.style.position = 'relative';

            const w = this.container.clientWidth;
            const h = this.container.clientHeight;
            const dpr = window.devicePixelRatio || 1;

            const makeCanvas = (zIndex) => {
                const c = document.createElement('canvas');
                c.style.position = 'absolute';
                c.style.left = '0';
                c.style.top = '0';
                c.style.width = w + 'px';
                c.style.height = h + 'px';
                c.style.zIndex = zIndex;
                c.width = w * dpr;
                c.height = h * dpr;
                const ctx = c.getContext('2d');
                ctx.scale(dpr, dpr);
                this.container.appendChild(c);
                return { canvas: c, ctx };
            };

            const bg = makeCanvas(1);
            this.bgCanvas = bg.canvas;
            this.bgCtx = bg.ctx;

            const ev = makeCanvas(2);
            this.eventCanvas = ev.canvas;
            this.eventCtx = ev.ctx;

            const ov = makeCanvas(3);
            this.overlayCanvas = ov.canvas;
            this.overlayCtx = ov.ctx;

            this._width = w;
            this._height = h;
            this._dpr = dpr;
        }

        // ─── 事件绑定（绑定到 container，避免 canvas 重建后失效） ───
        _bindEvents() {
            const ov = this.container;

            // 鼠标滚轮 — 缩放
            ov.addEventListener('wheel', (e) => {
                e.preventDefault();
                const rect = ov.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                if (e.ctrlKey || !e.shiftKey) {
                    // 水平缩放
                    const factor = e.deltaY > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
                    this._zoomAtX(mx, factor);
                }
                if (e.shiftKey && !e.ctrlKey) {
                    // shift+wheel: 垂直滚动
                    this.scrollY += e.deltaY * SCROLL_SENSITIVITY;
                    this._clampScrollY();
                }
                if (!e.shiftKey && !e.ctrlKey) {
                    // 纯滚轮: 垂直滚动优先
                    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                        this.scrollY += e.deltaY * SCROLL_SENSITIVITY;
                        this._clampScrollY();
                    } else {
                        // 水平滚动 → 平移
                        const timeDelta = (e.deltaX / this._eventAreaWidth()) *
                            (this.viewportEnd - this.viewportStart);
                        this.viewportStart += timeDelta;
                        this.viewportEnd += timeDelta;
                        this._clampViewport();
                    }
                }
                this._scheduleRender();
            }, { passive: false });

            // 鼠标按下
            ov.addEventListener('mousedown', (e) => {
                const rect = ov.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                this._dragStart = { x: mx, y: my, vpStart: this.viewportStart, vpEnd: this.viewportEnd, scrollY: this.scrollY };
                this._dragButton = e.button;

                if (this.selectionMode || e.shiftKey) {
                    // 选区模式
                    this._dragging = false;
                    this.selectionRect = { x1: mx, y1: my, x2: mx, y2: my };
                    this.selectedEvents = [];
                    this._scheduleRender();
                } else {
                    this._dragging = true;
                }
            });

            // 鼠标移动
            ov.addEventListener('mousemove', (e) => {
                const rect = ov.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                if (this.selectionRect && this._dragStart && (this.selectionMode || e.shiftKey)) {
                    // 更新选区
                    this.selectionRect.x2 = mx;
                    this.selectionRect.y2 = my;
                    this._scheduleRender();
                    return;
                }

                if (this._dragging && this._dragStart) {
                    // 平移
                    const dx = mx - this._dragStart.x;
                    const dy = my - this._dragStart.y;
                    const timeRange = this._dragStart.vpEnd - this._dragStart.vpStart;
                    const timeDelta = -(dx / this._eventAreaWidth()) * timeRange;
                    this.viewportStart = this._dragStart.vpStart + timeDelta;
                    this.viewportEnd = this._dragStart.vpEnd + timeDelta;
                    this._clampViewport();
                    this.scrollY = this._dragStart.scrollY - dy;
                    this._clampScrollY();
                    this._scheduleRender();
                    return;
                }

                // Hover 检测
                this._updateHover(mx, my);
            });

            // 鼠标释放
            ov.addEventListener('mouseup', (e) => {
                if (this.selectionRect && this._dragStart && (this.selectionMode || e.shiftKey)) {
                    const rect = ov.getBoundingClientRect();
                    this.selectionRect.x2 = e.clientX - rect.left;
                    this.selectionRect.y2 = e.clientY - rect.top;
                    // 判断是否有效选区（至少 5px）
                    const dx = Math.abs(this.selectionRect.x2 - this.selectionRect.x1);
                    const dy = Math.abs(this.selectionRect.y2 - this.selectionRect.y1);
                    if (dx > 5 && dy > 5) {
                        this._computeSelectedEvents();
                        this._showSelectionPopup();
                    } else {
                        this.selectionRect = null;
                        this.selectedEvents = [];
                    }
                }
                this._dragging = false;
                this._dragStart = null;
                this._scheduleRender();
            });

            // 双击重置
            ov.addEventListener('dblclick', () => {
                this.viewportStart = this.data.timeRange.start;
                this.viewportEnd = this.data.timeRange.end || 1;
                this.scrollY = 0;
                this.selectionRect = null;
                this.selectedEvents = [];
                this._hideSelectionPopup();
                this._scheduleRender();
            });

            // 鼠标离开
            ov.addEventListener('mouseleave', () => {
                this.hoverEvent = null;
                this.hoverPos = null;
                this._scheduleRender();
            });

            // 窗口大小变化
            this._resizeObserver = new ResizeObserver(() => {
                this._createCanvases();
                this._scheduleRender();
            });
            this._resizeObserver.observe(this.container);
        }

        // ─── 视口辅助 ───
        _eventAreaWidth() {
            return this._width - LANE_HEADER_WIDTH;
        }

        _timeToX(ts) {
            const range = this.viewportEnd - this.viewportStart;
            if (range <= 0) return LANE_HEADER_WIDTH;
            return LANE_HEADER_WIDTH + ((ts - this.viewportStart) / range) * this._eventAreaWidth();
        }

        _xToTime(x) {
            const range = this.viewportEnd - this.viewportStart;
            return this.viewportStart + ((x - LANE_HEADER_WIDTH) / this._eventAreaWidth()) * range;
        }

        _zoomAtX(screenX, factor) {
            const t = this._xToTime(screenX);
            const newStart = t - (t - this.viewportStart) * factor;
            const newEnd = t + (this.viewportEnd - t) * factor;
            // 限制最小缩放范围
            if (newEnd - newStart < 0.01) return;
            // 限制最大缩放范围
            const maxRange = (this.data.timeRange.end - this.data.timeRange.start) * 2;
            if (newEnd - newStart > maxRange) return;
            this.viewportStart = newStart;
            this.viewportEnd = newEnd;
        }

        _clampViewport() {
            const range = this.viewportEnd - this.viewportStart;
            const globalStart = this.data.timeRange.start;
            const globalEnd = this.data.timeRange.end;
            if (this.viewportStart < globalStart - range * 0.1) {
                this.viewportStart = globalStart - range * 0.1;
                this.viewportEnd = this.viewportStart + range;
            }
            if (this.viewportEnd > globalEnd + range * 0.1) {
                this.viewportEnd = globalEnd + range * 0.1;
                this.viewportStart = this.viewportEnd - range;
            }
        }

        _clampScrollY() {
            const maxScroll = Math.max(0, this._totalHeight - this._height + 40);
            this.scrollY = Math.max(0, Math.min(this.scrollY, maxScroll));
        }

        // ─── 渲染调度 ───
        _scheduleRender() {
            if (this._renderPending) return;
            this._renderPending = true;
            requestAnimationFrame(() => {
                this._renderPending = false;
                this._render();
            });
        }

        _render() {
            this._renderBg();
            this._renderEvents();
            this._renderOverlay();
        }

        // ─── 背景层：时间轴 + 网格 + 泳道标签 ───
        _renderBg() {
            const ctx = this.bgCtx;
            const w = this._width;
            const h = this._height;

            // 读取 CSS 变量
            const style = getComputedStyle(this.container);
            const bgColor = style.getPropertyValue('--bg').trim() || '#FFFFFF';
            const textColor = style.getPropertyValue('--text').trim() || '#1E293B';
            const textSecondary = style.getPropertyValue('--text-secondary').trim() || '#64748B';
            const borderColor = style.getPropertyValue('--border').trim() || '#E2E8F0';
            const bgSecondary = style.getPropertyValue('--bg-secondary').trim() || '#F8FAFC';

            ctx.clearRect(0, 0, w, h);

            // 背景
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, w, h);

            // 时间轴区域背景
            ctx.fillStyle = bgSecondary;
            ctx.fillRect(LANE_HEADER_WIDTH, 0, w - LANE_HEADER_WIDTH, TIME_AXIS_HEIGHT);

            // 时间轴刻度
            const range = this.viewportEnd - this.viewportStart;
            const maxTicks = Math.floor(this._eventAreaWidth() / 100);
            const step = niceStep(range, maxTicks);
            const firstTick = Math.ceil(this.viewportStart / step) * step;

            ctx.strokeStyle = borderColor;
            ctx.fillStyle = textSecondary;
            ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
            ctx.textAlign = 'center';

            for (let t = firstTick; t <= this.viewportEnd; t += step) {
                const x = this._timeToX(t);
                if (x < LANE_HEADER_WIDTH || x > w) continue;

                // 刻度线
                ctx.beginPath();
                ctx.moveTo(x, TIME_AXIS_HEIGHT - 6);
                ctx.lineTo(x, TIME_AXIS_HEIGHT);
                ctx.stroke();

                // 网格线（浅色）
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.moveTo(x, TIME_AXIS_HEIGHT);
                ctx.lineTo(x, h);
                ctx.stroke();
                ctx.restore();

                // 刻度文字
                ctx.fillText(formatTime(t), x, TIME_AXIS_HEIGHT - 10);
            }

            // 左侧标题区域背景
            ctx.fillStyle = bgSecondary;
            ctx.fillRect(0, 0, LANE_HEADER_WIDTH, h);

            // 泳道标签
            const offsetY = -this.scrollY;

            for (const layout of this._sublaneLayout) {
                const y = layout.y + offsetY;
                if (y + layout.height < TIME_AXIS_HEIGHT || y > h) continue;

                // 子泳道标签
                ctx.fillStyle = textSecondary;
                ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(
                    layout.sublane.label,
                    LANE_HEADER_WIDTH - 8,
                    y + layout.height / 2 + 4,
                    LANE_HEADER_WIDTH - 16
                );

                // 分隔线
                ctx.strokeStyle = borderColor;
                ctx.globalAlpha = 0.4;
                ctx.beginPath();
                ctx.moveTo(LANE_HEADER_WIDTH, y + layout.height);
                ctx.lineTo(w, y + layout.height);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }

            // Lane 组标题
            let prevLane = null;
            for (const layout of this._sublaneLayout) {
                if (layout.lane === prevLane) continue;
                prevLane = layout.lane;
                // 找到该 lane 第一个 sublane 的位置
                const y = layout.y + offsetY - LANE_TITLE_HEIGHT;
                if (y + LANE_TITLE_HEIGHT < TIME_AXIS_HEIGHT || y > h) continue;

                ctx.fillStyle = textColor;
                ctx.font = 'bold 12px -apple-system, "Segoe UI", sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(layout.lane.label, 8, y + LANE_TITLE_HEIGHT - 6);

                // lane 组分隔线
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            // 左侧面板右边框
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(LANE_HEADER_WIDTH, 0);
            ctx.lineTo(LANE_HEADER_WIDTH, h);
            ctx.stroke();

            // 时间轴底线
            ctx.beginPath();
            ctx.moveTo(0, TIME_AXIS_HEIGHT);
            ctx.lineTo(w, TIME_AXIS_HEIGHT);
            ctx.stroke();
        }

        // ─── 事件层：彩色矩形 ───
        _renderEvents() {
            const ctx = this.eventCtx;
            const w = this._width;
            const h = this._height;
            ctx.clearRect(0, 0, w, h);

            const vpStart = this.viewportStart;
            const vpEnd = this.viewportEnd;
            const offsetY = -this.scrollY;

            // 读取 CSS 变量
            const style = getComputedStyle(this.container);
            const textOnDark = '#FFFFFF';

            for (const layout of this._sublaneLayout) {
                const y = layout.y + offsetY;
                if (y + layout.height < TIME_AXIS_HEIGHT || y > h) continue;

                const events = layout.sublane.events;
                if (!events.length) continue;

                // 二分查找可见事件范围
                // 找到第一个 ts+dur >= vpStart 的事件
                let startIdx = bisectLeft(events, vpStart);
                // 往前回退几个（dur 可能使更早的事件仍然可见）
                startIdx = Math.max(0, startIdx - 1);

                for (let i = startIdx; i < events.length; i++) {
                    const evt = events[i];
                    if (evt.ts > vpEnd) break; // 超出可见范围

                    const evtEnd = evt.ts + evt.dur;
                    if (evtEnd < vpStart) continue;

                    const x1 = Math.max(LANE_HEADER_WIDTH, this._timeToX(evt.ts));
                    const x2 = Math.min(w, this._timeToX(evtEnd));
                    const rectW = Math.max(1, x2 - x1); // 至少 1px 宽

                    // 颜色
                    const catInfo = this.categories[evt.cat];
                    const baseColor = catInfo ? catInfo.color : '#95a5a6';
                    const color = adjustColor(baseColor, evt.name);

                    ctx.fillStyle = color;
                    ctx.fillRect(x1, y + 2, rectW, layout.height - 4);

                    // 事件名文字（仅矩形够宽时）
                    if (rectW > MIN_TEXT_WIDTH) {
                        ctx.fillStyle = textOnDark;
                        ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
                        ctx.textAlign = 'left';
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(x1, y + 2, rectW, layout.height - 4);
                        ctx.clip();
                        ctx.fillText(evt.name, x1 + 3, y + layout.height / 2 + 3);
                        ctx.restore();
                    }
                }
            }
        }

        // ─── 覆盖层：选区、tooltip、高亮 ───
        _renderOverlay() {
            const ctx = this.overlayCtx;
            const w = this._width;
            const h = this._height;
            ctx.clearRect(0, 0, w, h);

            // 选区矩形
            if (this.selectionRect) {
                const sr = this.selectionRect;
                const x = Math.min(sr.x1, sr.x2);
                const y = Math.min(sr.y1, sr.y2);
                const rw = Math.abs(sr.x2 - sr.x1);
                const rh = Math.abs(sr.y2 - sr.y1);

                ctx.fillStyle = 'rgba(37, 99, 235, 0.15)';
                ctx.fillRect(x, y, rw, rh);
                ctx.strokeStyle = 'rgba(37, 99, 235, 0.6)';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x, y, rw, rh);
            }

            // 选中事件高亮
            if (this.selectedEvents.length > 0) {
                ctx.strokeStyle = 'rgba(37, 99, 235, 0.9)';
                ctx.lineWidth = 2;
                const offsetY = -this.scrollY;
                for (const { evt, layout } of this.selectedEvents) {
                    const x1 = Math.max(LANE_HEADER_WIDTH, this._timeToX(evt.ts));
                    const x2 = Math.min(w, this._timeToX(evt.ts + evt.dur));
                    const rw = Math.max(1, x2 - x1);
                    const y = layout.y + offsetY;
                    ctx.strokeRect(x1 - 1, y + 1, rw + 2, layout.height - 2);
                }
            }

            // Hover tooltip
            if (this.hoverEvent && this.hoverPos) {
                this._renderTooltip(ctx, this.hoverEvent, this.hoverPos);
            }
        }

        _renderTooltip(ctx, evt, pos) {
            const lines = [
                evt.name,
                `类别: ${evt.cat}`,
                `开始: ${formatTime(evt.ts)}`,
                `耗时: ${formatTime(evt.dur)}`,
            ];
            if (evt.args) {
                for (const [k, v] of Object.entries(evt.args).slice(0, 4)) {
                    lines.push(`${k}: ${v}`);
                }
            }

            ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
            const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
            const tipW = maxWidth + TOOLTIP_PAD * 2;
            const tipH = lines.length * 16 + TOOLTIP_PAD * 2;

            let tipX = pos.x + 12;
            let tipY = pos.y + 12;
            if (tipX + tipW > this._width) tipX = pos.x - tipW - 8;
            if (tipY + tipH > this._height) tipY = pos.y - tipH - 8;

            // 读取主题色
            const style = getComputedStyle(this.container);
            const bgElevated = style.getPropertyValue('--bg-elevated').trim() || '#FFFFFF';
            const textColor = style.getPropertyValue('--text').trim() || '#1E293B';
            const borderColor = style.getPropertyValue('--border').trim() || '#E2E8F0';

            ctx.fillStyle = bgElevated;
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1;
            ctx.shadowColor = 'rgba(0,0,0,0.15)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(tipX, tipY, tipW, tipH, 6);
            } else {
                ctx.rect(tipX, tipY, tipW, tipH);
            }
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.fillStyle = textColor;
            ctx.textAlign = 'left';
            for (let i = 0; i < lines.length; i++) {
                if (i === 0) ctx.font = 'bold 12px -apple-system, "Segoe UI", sans-serif';
                else ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
                ctx.fillText(lines[i], tipX + TOOLTIP_PAD, tipY + TOOLTIP_PAD + 12 + i * 16);
            }
        }

        // ─── Hover 命中检测 ───
        _updateHover(mx, my) {
            const found = this._findEventAtPoint(mx, my);
            if (found) {
                this.hoverEvent = found.evt;
                this.hoverPos = { x: mx, y: my };
                this.container.style.cursor = 'pointer';
            } else {
                this.hoverEvent = null;
                this.hoverPos = null;
                this.container.style.cursor = this.selectionMode ? 'crosshair' : 'grab';
            }
            this._scheduleRender();
        }

        _findEventAtPoint(mx, my) {
            if (mx < LANE_HEADER_WIDTH || my < TIME_AXIS_HEIGHT) return null;
            const t = this._xToTime(mx);
            const offsetY = -this.scrollY;

            for (const layout of this._sublaneLayout) {
                const y = layout.y + offsetY;
                if (my < y + 2 || my > y + layout.height - 2) continue;

                const events = layout.sublane.events;
                // 二分查找
                let idx = bisectLeft(events, t);
                // 检查 idx 和 idx-1
                for (let i = Math.max(0, idx - 1); i <= Math.min(events.length - 1, idx + 1); i++) {
                    const evt = events[i];
                    if (t >= evt.ts && t <= evt.ts + evt.dur) {
                        return { evt, layout };
                    }
                }
            }
            return null;
        }

        // ─── 选区事件命中 ───
        _computeSelectedEvents() {
            this.selectedEvents = [];
            if (!this.selectionRect) return;

            const sr = this.selectionRect;
            const xMin = Math.min(sr.x1, sr.x2);
            const xMax = Math.max(sr.x1, sr.x2);
            const yMin = Math.min(sr.y1, sr.y2);
            const yMax = Math.max(sr.y1, sr.y2);

            const tStart = this._xToTime(xMin);
            const tEnd = this._xToTime(xMax);
            const offsetY = -this.scrollY;

            for (const layout of this._sublaneLayout) {
                const ly = layout.y + offsetY;
                const lyEnd = ly + layout.height;
                if (lyEnd < yMin || ly > yMax) continue;

                const events = layout.sublane.events;
                const startIdx = Math.max(0, bisectLeft(events, tStart) - 1);
                for (let i = startIdx; i < events.length; i++) {
                    const evt = events[i];
                    if (evt.ts > tEnd) break;
                    const evtEnd = evt.ts + evt.dur;
                    if (evtEnd >= tStart && evt.ts <= tEnd) {
                        this.selectedEvents.push({ evt, layout });
                    }
                }
            }
        }

        // ─── 选区弹出面板 ───
        _showSelectionPopup() {
            if (this.selectedEvents.length === 0) return;

            // 移除旧弹窗
            this._hideSelectionPopup();

            // 统计
            const evts = this.selectedEvents.map(e => e.evt);
            const totalDur = evts.reduce((s, e) => s + e.dur, 0);
            const minTs = Math.min(...evts.map(e => e.ts));
            const maxTs = Math.max(...evts.map(e => e.ts + e.dur));
            const devices = new Set();
            this.selectedEvents.forEach(({ layout }) => {
                devices.add(layout.lane.label);
            });

            // 构建 context 文本
            const topEvents = [...evts].sort((a, b) => b.dur - a.dur).slice(0, 50);
            let contextText = `用户在 Trace 泳道图中框选了以下区域:\n`;
            contextText += `时间范围: ${formatTime(minTs)} - ${formatTime(maxTs)}\n`;
            contextText += `涉及设备: ${[...devices].join(', ')}\n`;
            contextText += `共 ${evts.length} 个事件, 总耗时 ${formatTime(totalDur)}\n\n`;
            contextText += `Top 事件 (按耗时排序):\n`;
            contextText += `| 名称 | 类别 | 耗时 | 设备 |\n`;
            contextText += `| --- | --- | --- | --- |\n`;
            for (const e of topEvents) {
                const device = this.selectedEvents.find(se => se.evt === e)?.layout.lane.label || '';
                contextText += `| ${e.name} | ${e.cat} | ${formatTime(e.dur)} | ${device} |\n`;
            }

            // 弹窗 HTML
            const popup = document.createElement('div');
            popup.className = 'swimlane-selection-popup';
            popup.id = 'swimlane-selection-popup';

            const sr = this.selectionRect;
            const popupX = Math.max(LANE_HEADER_WIDTH, Math.min(sr.x1, sr.x2));
            const popupY = Math.max(sr.y1, sr.y2) + 8;

            popup.style.left = popupX + 'px';
            popup.style.top = Math.min(popupY, this._height - 80) + 'px';

            popup.innerHTML = `
                <div class="swimlane-selection-summary">
                    选中 <strong>${evts.length}</strong> 个事件 |
                    时间范围 ${formatTime(minTs)} - ${formatTime(maxTs)} |
                    涉及 ${[...devices].join(', ')}
                </div>
                <div class="swimlane-selection-actions">
                    <button class="btn btn-primary btn-sm" id="swimlane-ask-ai">
                        <i data-lucide="message-circle" style="width:14px;height:14px;"></i> 询问 AI
                    </button>
                    <button class="btn btn-secondary btn-sm" id="swimlane-clear-sel">清除选区</button>
                </div>
            `;
            this.container.appendChild(popup);

            // 初始化 lucide 图标
            if (window.lucide) lucide.createIcons({ nodes: [popup] });

            // 绑定按钮事件
            document.getElementById('swimlane-ask-ai').addEventListener('click', () => {
                const autoQ = `请分析这段 Trace 选区中的 ${evts.length} 个事件，识别性能瓶颈和优化建议。`;
                if (window.askAIAboutSelection) {
                    window.askAIAboutSelection(contextText, autoQ);
                }
                this._hideSelectionPopup();
            });

            document.getElementById('swimlane-clear-sel').addEventListener('click', () => {
                this.selectionRect = null;
                this.selectedEvents = [];
                this._hideSelectionPopup();
                this._scheduleRender();
            });
        }

        _hideSelectionPopup() {
            const old = document.getElementById('swimlane-selection-popup');
            if (old) old.remove();
        }

        // ─── 公开方法 ───
        setSelectionMode(enabled) {
            this.selectionMode = enabled;
            this.container.style.cursor = enabled ? 'crosshair' : 'grab';
        }

        resetView() {
            this.viewportStart = this.data.timeRange.start;
            this.viewportEnd = this.data.timeRange.end || 1;
            this.scrollY = 0;
            this.selectionRect = null;
            this.selectedEvents = [];
            this._hideSelectionPopup();
            this._scheduleRender();
        }

        destroy() {
            if (this._resizeObserver) this._resizeObserver.disconnect();
            this._hideSelectionPopup();
            this.container.innerHTML = '';
        }
    }

    // ─── 初始化入口 ───
    window.SwimlaneViewer = SwimlaneViewer;

    /**
     * 加载泳道 Trace 视图（替代 loadPerfettoTrace）
     */
    window.loadSwimlaneTrace = async function (jobId) {
        const container = document.getElementById('swimlane-container');
        const statusEl = document.getElementById('swimlane-status');
        const btn = document.getElementById('trace-open-btn');
        if (!container) return;

        if (btn) btn.disabled = true;
        if (statusEl) statusEl.textContent = '正在加载泳道数据...';

        try {
            const resp = await fetch('/api/jobs/' + jobId + '/swimlane');
            if (!resp.ok) {
                throw new Error(resp.statusText || '加载失败');
            }
            const data = await resp.json();

            if (!data.lanes || data.lanes.length === 0) {
                if (statusEl) statusEl.textContent = '未找到 Trace 数据。';
                if (btn) btn.disabled = false;
                return;
            }

            // 统计事件总数
            let totalEvents = 0;
            for (const lane of data.lanes) {
                for (const sub of lane.sublanes) {
                    totalEvents += sub.events.length;
                }
            }

            container.style.display = 'block';
            const toolbar = document.getElementById('swimlane-toolbar');
            if (toolbar) toolbar.style.display = 'flex';
            if (btn) btn.style.display = 'none';
            if (statusEl) {
                statusEl.textContent = `已加载 ${data.lanes.length} 个设备, ${totalEvents} 个事件`;
            }

            // 创建泳道查看器
            const viewer = new SwimlaneViewer(container, data);
            window.__swimlaneViewer = viewer;

            // 工具栏按钮绑定
            const resetBtn = document.getElementById('swimlane-reset');
            if (resetBtn) resetBtn.addEventListener('click', () => viewer.resetView());

            const selBtn = document.getElementById('swimlane-select-mode');
            if (selBtn) {
                selBtn.addEventListener('click', () => {
                    const active = selBtn.classList.toggle('active');
                    viewer.setSelectionMode(active);
                    selBtn.textContent = active ? '选区模式 (开)' : '选区模式';
                });
            }

            // 构建图例
            const legendEl = document.getElementById('swimlane-legend');
            if (legendEl && data.categories) {
                legendEl.innerHTML = '';
                for (const [cat, info] of Object.entries(data.categories)) {
                    const span = document.createElement('span');
                    span.className = 'swimlane-legend-item';
                    span.innerHTML = `<span class="swimlane-legend-dot" style="background:${info.color}"></span>${info.label}`;
                    legendEl.appendChild(span);
                }
            }

        } catch (err) {
            if (statusEl) statusEl.textContent = '加载失败: ' + err.message;
            if (btn) btn.disabled = false;
        }
    };

})();
