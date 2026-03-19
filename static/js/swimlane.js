/* ─── Canvas 泳道渲染器 — 多卡 Trace 可视化 (Perfetto 风格 WASD 操作) ─── */

(function () {
    'use strict';

    // ─── 布局常量 ───
    const LANE_HEADER_WIDTH = 180;
    const SUBLANE_HEIGHT = 24;
    const LANE_GAP = 12;
    const LANE_TITLE_HEIGHT = 28;
    const TIME_AXIS_HEIGHT = 32;
    const MIN_TEXT_WIDTH = 50;
    const TOOLTIP_PAD = 8;
    const DETAIL_PANEL_WIDTH = 320;

    // ─── WASD 常量（加速模式） ───
    const PAN_BASE = 8;                // A/D 基础平移速度 (px/frame)
    const ZOOM_BASE = 0.008;           // W/S 基础缩放速度
    const SCROLL_BASE = 8;             // Q/E 基础垂直滚动
    const ACCEL_PER_SEC = 1.8;         // 每秒加速倍数
    const MAX_SPEED_MULT = 12;         // 最大速度倍数

    // ─── 20 色调色板（按算子名称分配，确保视觉区分） ───
    const NAME_PALETTE = [
        '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
        '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
        '#86bcb6', '#8cd17d', '#b6992d', '#499894', '#d37295',
        '#f1ce63', '#a0cbe8', '#ffbe7d', '#d4a6c8', '#fabfd2',
    ];
    const _nameColorCache = {};

    function nameToColor(name) {
        if (_nameColorCache[name]) return _nameColorCache[name];
        // 稳定 hash
        let h = 0;
        for (let i = 0; i < name.length; i++) {
            h = ((h << 5) - h + name.charCodeAt(i)) | 0;
        }
        const color = NAME_PALETTE[((h >>> 0) % NAME_PALETTE.length)];
        _nameColorCache[name] = color;
        return color;
    }

    // ─── 二分查找 ───
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
        if (us < 1) return (us * 1000).toFixed(0) + ' ns';
        if (us < 1000) return us.toFixed(1) + ' μs';
        if (us < 1000000) return (us / 1000).toFixed(2) + ' ms';
        return (us / 1000000).toFixed(3) + ' s';
    }

    // ─── 自适应时间刻度 ───
    function niceStep(range, maxTicks) {
        if (range <= 0 || maxTicks <= 0) return 1;
        const rough = range / maxTicks;
        const mag = Math.pow(10, Math.floor(Math.log10(rough)));
        const norm = rough / mag;
        if (norm < 1.5) return mag;
        if (norm < 3.5) return 2 * mag;
        if (norm < 7.5) return 5 * mag;
        return 10 * mag;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SwimlaneViewer
    // ═══════════════════════════════════════════════════════════════════════════
    class SwimlaneViewer {
        constructor(container, data) {
            this.container = container;
            this.data = data;
            this.lanes = data.lanes || [];
            this.categories = data.categories || {};

            this.viewportStart = data.timeRange.start;
            this.viewportEnd = data.timeRange.end || 1;
            this.scrollY = 0;

            // 选区
            this.selectionRect = null;
            this.selectedEvents = [];
            this.selectionMode = false;

            // hover
            this.hoverEvent = null;
            this.hoverPos = null;

            // 点击选中的事件（显示详情面板）
            this.clickedEvent = null;
            this.clickedLayout = null;

            // 鼠标拖拽
            this._dragStart = null;

            // WASD 按键状态 + 加速
            this._keysDown = new Set();
            this._keyStartTime = {};  // code -> timestamp（用于加速）
            this._animating = false;

            this._cssColors = null;

            this._layoutSublanes();
            this._createCanvases();
            this._bindEvents();
            this._scheduleRender();
        }

        // ─── 布局 ───
        _layoutSublanes() {
            this._sublaneLayout = [];
            let y = TIME_AXIS_HEIGHT;
            for (const lane of this.lanes) {
                y += LANE_TITLE_HEIGHT;
                for (const sub of lane.sublanes) {
                    this._sublaneLayout.push({ lane, sublane: sub, y, height: SUBLANE_HEIGHT });
                    y += SUBLANE_HEIGHT;
                }
                y += LANE_GAP;
            }
            this._totalHeight = y;
        }

        _createCanvases() {
            this.container.querySelectorAll('canvas').forEach(c => c.remove());
            this.container.style.overflow = 'hidden';
            this.container.style.position = 'relative';

            const w = this.container.clientWidth;
            const h = this.container.clientHeight;
            if (w === 0 || h === 0) return;
            const dpr = window.devicePixelRatio || 1;

            const makeCanvas = (zIndex) => {
                const c = document.createElement('canvas');
                c.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;z-index:${zIndex}`;
                c.width = w * dpr;
                c.height = h * dpr;
                const ctx = c.getContext('2d');
                ctx.scale(dpr, dpr);
                this.container.appendChild(c);
                return { canvas: c, ctx };
            };

            const bg = makeCanvas(1);
            this.bgCanvas = bg.canvas; this.bgCtx = bg.ctx;
            const ev = makeCanvas(2);
            this.eventCanvas = ev.canvas; this.eventCtx = ev.ctx;
            const ov = makeCanvas(3);
            this.overlayCanvas = ov.canvas; this.overlayCtx = ov.ctx;

            this._width = w;
            this._height = h;
            this._dpr = dpr;
            this._cssColors = null;
        }

        _getColors() {
            if (this._cssColors) return this._cssColors;
            const s = getComputedStyle(this.container);
            this._cssColors = {
                bg: s.getPropertyValue('--bg').trim() || '#FFFFFF',
                bgSec: s.getPropertyValue('--bg-secondary').trim() || '#F8FAFC',
                bgElev: s.getPropertyValue('--bg-elevated').trim() || '#FFFFFF',
                text: s.getPropertyValue('--text').trim() || '#1E293B',
                textSec: s.getPropertyValue('--text-secondary').trim() || '#64748B',
                textLight: s.getPropertyValue('--text-light').trim() || '#94A3B8',
                border: s.getPropertyValue('--border').trim() || '#E2E8F0',
            };
            return this._cssColors;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 事件绑定
        // ═══════════════════════════════════════════════════════════════════════
        _bindEvents() {
            const el = this.container;

            // 滚轮 → 垂直滚动
            el.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.scrollY += e.deltaY;
                this._clampScrollY();
                this._scheduleRender();
            }, { passive: false });

            // 鼠标按下
            el.addEventListener('mousedown', (e) => {
                const rect = el.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                if (this.selectionMode || e.shiftKey) {
                    this._dragStart = { x: mx, y: my };
                    this.selectionRect = { x1: mx, y1: my, x2: mx, y2: my };
                    this.selectedEvents = [];
                    this._hideSelectionPopup();
                    this._scheduleRender();
                }
            });

            el.addEventListener('mousemove', (e) => {
                const rect = el.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                if (this._dragStart && this.selectionRect) {
                    this.selectionRect.x2 = mx;
                    this.selectionRect.y2 = my;
                    this._scheduleRender();
                    return;
                }
                this._updateHover(mx, my);
            });

            el.addEventListener('mouseup', (e) => {
                if (this._dragStart && this.selectionRect) {
                    const rect = el.getBoundingClientRect();
                    this.selectionRect.x2 = e.clientX - rect.left;
                    this.selectionRect.y2 = e.clientY - rect.top;
                    const dx = Math.abs(this.selectionRect.x2 - this.selectionRect.x1);
                    const dy = Math.abs(this.selectionRect.y2 - this.selectionRect.y1);
                    if (dx > 5 && dy > 5) {
                        this._computeSelectedEvents();
                        this._showSelectionPopup();
                    } else {
                        this.selectionRect = null;
                        this.selectedEvents = [];
                    }
                    this._dragStart = null;
                    this._scheduleRender();
                }
            });

            // 点击 → 显示事件详情面板 (issue #3)
            el.addEventListener('click', (e) => {
                if (this._dragStart) return; // 拖拽中不处理
                const rect = el.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const found = this._findEventAtPoint(mx, my);
                if (found) {
                    this.clickedEvent = found.evt;
                    this.clickedLayout = found.layout;
                    this._showDetailPanel(found.evt, found.layout);
                } else {
                    this.clickedEvent = null;
                    this.clickedLayout = null;
                    this._hideDetailPanel();
                }
                this._scheduleRender();
            });

            // 双击重置
            el.addEventListener('dblclick', () => this.resetView());

            el.addEventListener('mouseleave', () => {
                this.hoverEvent = null;
                this.hoverPos = null;
                this._scheduleRender();
            });

            // ─── WASD 键盘控制 (加速模式) ───
            this._onKeyDown = (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
                    e.target.isContentEditable) return;
                if (e.ctrlKey || e.metaKey || e.altKey) return;

                const code = e.code;
                if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE'].includes(code)) {
                    e.preventDefault();
                    if (!this._keysDown.has(code)) {
                        this._keysDown.add(code);
                        this._keyStartTime[code] = performance.now();
                    }
                    this._startAnimation();
                }
                if (code === 'KeyF') { e.preventDefault(); this.resetView(); }
                if (code === 'Escape') { this._hideDetailPanel(); this.clickedEvent = null; this._scheduleRender(); }
            };

            this._onKeyUp = (e) => {
                this._keysDown.delete(e.code);
                delete this._keyStartTime[e.code];
            };

            document.addEventListener('keydown', this._onKeyDown);
            document.addEventListener('keyup', this._onKeyUp);

            this._resizeObserver = new ResizeObserver(() => {
                this._createCanvases();
                this._scheduleRender();
            });
            this._resizeObserver.observe(this.container);
        }

        // ─── WASD 加速动画 ───
        _getSpeedMult(code) {
            const startT = this._keyStartTime[code];
            if (!startT) return 1;
            const held = (performance.now() - startT) / 1000; // 秒
            return Math.min(MAX_SPEED_MULT, 1 + held * ACCEL_PER_SEC);
        }

        _startAnimation() {
            if (this._animating) return;
            this._animating = true;
            this._lastAnimTime = performance.now();
            this._animLoop();
        }

        _animLoop() {
            if (this._keysDown.size === 0) {
                this._animating = false;
                return;
            }

            const now = performance.now();
            const dt = Math.min(now - this._lastAnimTime, 50);
            this._lastAnimTime = now;
            const dtNorm = dt / 16.67;

            const range = this.viewportEnd - this.viewportStart;
            let needRender = false;

            if (this._keysDown.has('KeyW')) {
                const m = this._getSpeedMult('KeyW');
                this._zoomCenter(1 - ZOOM_BASE * m * dtNorm);
                needRender = true;
            }
            if (this._keysDown.has('KeyS')) {
                const m = this._getSpeedMult('KeyS');
                this._zoomCenter(1 + ZOOM_BASE * m * dtNorm);
                needRender = true;
            }
            if (this._keysDown.has('KeyA')) {
                const m = this._getSpeedMult('KeyA');
                const pan = (PAN_BASE * m / this._eventAreaWidth()) * range * dtNorm;
                this.viewportStart -= pan;
                this.viewportEnd -= pan;
                this._clampViewport();
                needRender = true;
            }
            if (this._keysDown.has('KeyD')) {
                const m = this._getSpeedMult('KeyD');
                const pan = (PAN_BASE * m / this._eventAreaWidth()) * range * dtNorm;
                this.viewportStart += pan;
                this.viewportEnd += pan;
                this._clampViewport();
                needRender = true;
            }
            if (this._keysDown.has('KeyQ')) {
                const m = this._getSpeedMult('KeyQ');
                this.scrollY -= SCROLL_BASE * m * dtNorm;
                this._clampScrollY();
                needRender = true;
            }
            if (this._keysDown.has('KeyE')) {
                const m = this._getSpeedMult('KeyE');
                this.scrollY += SCROLL_BASE * m * dtNorm;
                this._clampScrollY();
                needRender = true;
            }

            if (needRender) this._scheduleRender();
            requestAnimationFrame(() => this._animLoop());
        }

        // ─── 视口 ───
        _eventAreaWidth() { return Math.max(1, this._width - LANE_HEADER_WIDTH); }

        _timeToX(ts) {
            const range = this.viewportEnd - this.viewportStart;
            if (range <= 0) return LANE_HEADER_WIDTH;
            return LANE_HEADER_WIDTH + ((ts - this.viewportStart) / range) * this._eventAreaWidth();
        }

        _xToTime(x) {
            return this.viewportStart + ((x - LANE_HEADER_WIDTH) / this._eventAreaWidth()) * (this.viewportEnd - this.viewportStart);
        }

        _zoomCenter(factor) {
            const mid = (this.viewportStart + this.viewportEnd) / 2;
            const halfRange = (this.viewportEnd - this.viewportStart) / 2 * factor;
            if (halfRange < 0.005) return;
            const maxHalf = (this.data.timeRange.end - this.data.timeRange.start);
            if (halfRange > maxHalf) return;
            this.viewportStart = mid - halfRange;
            this.viewportEnd = mid + halfRange;
        }

        _clampViewport() {
            const range = this.viewportEnd - this.viewportStart;
            const gs = this.data.timeRange.start, ge = this.data.timeRange.end;
            if (this.viewportStart < gs - range * 0.1) {
                this.viewportStart = gs - range * 0.1;
                this.viewportEnd = this.viewportStart + range;
            }
            if (this.viewportEnd > ge + range * 0.1) {
                this.viewportEnd = ge + range * 0.1;
                this.viewportStart = this.viewportEnd - range;
            }
        }

        _clampScrollY() {
            const maxScroll = Math.max(0, this._totalHeight - this._height + 40);
            this.scrollY = Math.max(0, Math.min(this.scrollY, maxScroll));
        }

        // ─── 渲染 ───
        _scheduleRender() {
            if (this._renderPending) return;
            this._renderPending = true;
            requestAnimationFrame(() => { this._renderPending = false; this._render(); });
        }

        _render() {
            this._renderBg();
            this._renderEvents();
            this._renderOverlay();
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 背景层
        // ═══════════════════════════════════════════════════════════════════════
        _renderBg() {
            const ctx = this.bgCtx;
            const w = this._width, h = this._height;
            const c = this._getColors();
            const oY = -this.scrollY;

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = c.bg;
            ctx.fillRect(0, 0, w, h);

            // 时间轴
            ctx.fillStyle = c.bgSec;
            ctx.fillRect(LANE_HEADER_WIDTH, 0, w - LANE_HEADER_WIDTH, TIME_AXIS_HEIGHT);

            const range = this.viewportEnd - this.viewportStart;
            const maxTicks = Math.floor(this._eventAreaWidth() / 100);
            const step = niceStep(range, maxTicks);
            const firstTick = Math.ceil(this.viewportStart / step) * step;

            ctx.font = '11px "Roboto Condensed", -apple-system, sans-serif';
            ctx.textAlign = 'center';

            for (let t = firstTick; t <= this.viewportEnd; t += step) {
                const x = this._timeToX(t);
                if (x < LANE_HEADER_WIDTH || x > w) continue;
                ctx.strokeStyle = c.border;
                ctx.beginPath(); ctx.moveTo(x, TIME_AXIS_HEIGHT - 6); ctx.lineTo(x, TIME_AXIS_HEIGHT); ctx.stroke();
                ctx.save(); ctx.globalAlpha = 0.2; ctx.strokeStyle = c.border;
                ctx.beginPath(); ctx.moveTo(x, TIME_AXIS_HEIGHT); ctx.lineTo(x, h); ctx.stroke(); ctx.restore();
                ctx.fillStyle = c.textSec;
                ctx.fillText(formatTime(t), x, TIME_AXIS_HEIGHT - 10);
            }

            // 左侧面板
            ctx.fillStyle = c.bgSec;
            ctx.fillRect(0, 0, LANE_HEADER_WIDTH, h);

            for (const layout of this._sublaneLayout) {
                const y = layout.y + oY;
                if (y + layout.height < TIME_AXIS_HEIGHT || y > h) continue;
                ctx.fillStyle = c.textSec;
                ctx.font = '10px "Roboto Condensed", -apple-system, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(layout.sublane.label, LANE_HEADER_WIDTH - 8, y + layout.height / 2 + 3, LANE_HEADER_WIDTH - 12);
                ctx.strokeStyle = c.border; ctx.globalAlpha = 0.3;
                ctx.beginPath(); ctx.moveTo(LANE_HEADER_WIDTH, y + layout.height); ctx.lineTo(w, y + layout.height); ctx.stroke();
                ctx.globalAlpha = 1;
            }

            // 模块标题
            let prevLane = null;
            for (const layout of this._sublaneLayout) {
                if (layout.lane === prevLane) continue;
                prevLane = layout.lane;
                const y = layout.y + oY - LANE_TITLE_HEIGHT;
                if (y + LANE_TITLE_HEIGHT < TIME_AXIS_HEIGHT || y > h) continue;
                ctx.fillStyle = c.bgSec;
                ctx.fillRect(0, y, w, LANE_TITLE_HEIGHT);
                ctx.fillStyle = c.text;
                ctx.font = 'bold 12px "Roboto Condensed", -apple-system, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(layout.lane.label, 10, y + LANE_TITLE_HEIGHT - 8);
                ctx.strokeStyle = c.border; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            }

            ctx.strokeStyle = c.border; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(LANE_HEADER_WIDTH, 0); ctx.lineTo(LANE_HEADER_WIDTH, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, TIME_AXIS_HEIGHT); ctx.lineTo(w, TIME_AXIS_HEIGHT); ctx.stroke();
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 事件层 — 按算子名称颜色区分 (issue #2)
        // ═══════════════════════════════════════════════════════════════════════
        _renderEvents() {
            const ctx = this.eventCtx;
            const w = this._width, h = this._height;
            ctx.clearRect(0, 0, w, h);

            const vpStart = this.viewportStart, vpEnd = this.viewportEnd;
            const oY = -this.scrollY;

            for (const layout of this._sublaneLayout) {
                const y = layout.y + oY;
                if (y + layout.height < TIME_AXIS_HEIGHT || y > h) continue;

                const events = layout.sublane.events;
                if (!events.length) continue;

                let startIdx = Math.max(0, bisectLeft(events, vpStart) - 1);

                for (let i = startIdx; i < events.length; i++) {
                    const evt = events[i];
                    if (evt.ts > vpEnd) break;
                    const evtEnd = evt.ts + evt.dur;
                    if (evtEnd < vpStart) continue;

                    const x1 = Math.max(LANE_HEADER_WIDTH, this._timeToX(evt.ts));
                    const x2 = Math.min(w, this._timeToX(evtEnd));
                    const rw = Math.max(1, x2 - x1);

                    // 按算子名称分配颜色
                    const color = nameToColor(evt.name);

                    ctx.fillStyle = color;
                    ctx.fillRect(x1, y + 1, rw, layout.height - 2);

                    // 文字 — 始终显示算子名称（小矩形用更小的字体）
                    if (rw > 3) {
                        ctx.fillStyle = '#FFFFFF';
                        const fontSize = rw > 60 ? 10 : rw > 20 ? 8 : 6;
                        ctx.font = `${fontSize}px "Roboto Condensed", -apple-system, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(x1, y + 1, rw, layout.height - 2);
                        ctx.clip();
                        ctx.fillText(evt.name, x1 + rw / 2, y + layout.height / 2 + Math.round(fontSize * 0.35));
                        ctx.restore();
                    }
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 覆盖层
        // ═══════════════════════════════════════════════════════════════════════
        _renderOverlay() {
            const ctx = this.overlayCtx;
            const w = this._width, h = this._height;
            ctx.clearRect(0, 0, w, h);

            // 选区矩形
            if (this.selectionRect) {
                const sr = this.selectionRect;
                const x = Math.min(sr.x1, sr.x2), y = Math.min(sr.y1, sr.y2);
                const rw = Math.abs(sr.x2 - sr.x1), rh = Math.abs(sr.y2 - sr.y1);
                ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
                ctx.fillRect(x, y, rw, rh);
                ctx.strokeStyle = 'rgba(37, 99, 235, 0.5)';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x, y, rw, rh);
            }

            // 选中事件高亮
            if (this.selectedEvents.length > 0) {
                ctx.strokeStyle = 'rgba(37, 99, 235, 0.85)';
                ctx.lineWidth = 2;
                const oY = -this.scrollY;
                for (const { evt, layout } of this.selectedEvents) {
                    const x1 = Math.max(LANE_HEADER_WIDTH, this._timeToX(evt.ts));
                    const x2 = Math.min(w, this._timeToX(evt.ts + evt.dur));
                    ctx.strokeRect(x1 - 1, layout.y + oY, Math.max(1, x2 - x1) + 2, layout.height);
                }
            }

            // 点击选中事件高亮 (issue #3)
            if (this.clickedEvent && this.clickedLayout) {
                const evt = this.clickedEvent;
                const layout = this.clickedLayout;
                const x1 = Math.max(LANE_HEADER_WIDTH, this._timeToX(evt.ts));
                const x2 = Math.min(w, this._timeToX(evt.ts + evt.dur));
                const rw = Math.max(1, x2 - x1);
                const y = layout.y + (-this.scrollY);
                ctx.strokeStyle = '#2563EB';
                ctx.lineWidth = 3;
                ctx.strokeRect(x1 - 2, y - 1, rw + 4, layout.height + 2);
            }

            // Hover tooltip
            if (this.hoverEvent && this.hoverPos) {
                this._renderTooltip(ctx);
            }
        }

        _renderTooltip(ctx) {
            const evt = this.hoverEvent;
            const pos = this.hoverPos;
            const lines = [evt.name, `类别: ${evt.cat}`, `开始: ${formatTime(evt.ts)}`, `耗时: ${formatTime(evt.dur)}`];

            ctx.font = '12px "Roboto Condensed", -apple-system, sans-serif';
            const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
            const tipW = maxW + TOOLTIP_PAD * 2;
            const tipH = lines.length * 16 + TOOLTIP_PAD * 2;
            let tipX = pos.x + 12, tipY = pos.y + 12;
            if (tipX + tipW > this._width) tipX = pos.x - tipW - 8;
            if (tipY + tipH > this._height) tipY = pos.y - tipH - 8;

            const c = this._getColors();
            ctx.fillStyle = c.bgElev; ctx.strokeStyle = c.border; ctx.lineWidth = 1;
            ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 6;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(tipX, tipY, tipW, tipH, 6);
            else ctx.rect(tipX, tipY, tipW, tipH);
            ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;

            ctx.fillStyle = c.text; ctx.textAlign = 'left';
            for (let i = 0; i < lines.length; i++) {
                ctx.font = i === 0 ? 'bold 12px "Roboto Condensed", -apple-system, sans-serif'
                    : '11px "Roboto Condensed", -apple-system, sans-serif';
                ctx.fillText(lines[i], tipX + TOOLTIP_PAD, tipY + TOOLTIP_PAD + 12 + i * 16);
            }
        }

        // ─── Hover / Hit test ───
        _updateHover(mx, my) {
            const found = this._findEventAtPoint(mx, my);
            if (found) {
                this.hoverEvent = found.evt;
                this.hoverPos = { x: mx, y: my };
                this.container.style.cursor = 'pointer';
            } else {
                this.hoverEvent = null;
                this.hoverPos = null;
                this.container.style.cursor = this.selectionMode ? 'crosshair' : 'default';
            }
            this._scheduleRender();
        }

        _findEventAtPoint(mx, my) {
            if (mx < LANE_HEADER_WIDTH || my < TIME_AXIS_HEIGHT) return null;
            const t = this._xToTime(mx);
            const oY = -this.scrollY;
            for (const layout of this._sublaneLayout) {
                const y = layout.y + oY;
                if (my < y + 1 || my > y + layout.height - 1) continue;
                const events = layout.sublane.events;
                let idx = bisectLeft(events, t);
                for (let i = Math.max(0, idx - 1); i <= Math.min(events.length - 1, idx + 1); i++) {
                    const evt = events[i];
                    if (t >= evt.ts && t <= evt.ts + evt.dur) return { evt, layout };
                }
            }
            return null;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 详情面板 (issue #3)
        // ═══════════════════════════════════════════════════════════════════════
        _showDetailPanel(evt, layout) {
            this._hideDetailPanel();
            const panel = document.createElement('div');
            panel.id = 'swimlane-detail-panel';
            panel.className = 'swimlane-detail-panel';

            const color = nameToColor(evt.name);
            const args = evt.args || {};
            let argsRows = '';
            if (args['Input type']) argsRows += `<tr><td>Dtype</td><td>${this._escapeHtml(args['Input type'])}</td></tr>`;
            if (args['Input Dims']) argsRows += `<tr><td>Shape</td><td>${this._escapeHtml(args['Input Dims'])}</td></tr>`;
            if (args['Task Type']) argsRows += `<tr><td>Task Type</td><td>${this._escapeHtml(args['Task Type'])}</td></tr>`;
            if (args['Task Id']) argsRows += `<tr><td>Task Id</td><td>${this._escapeHtml(args['Task Id'])}</td></tr>`;

            panel.innerHTML = `
                <div class="swimlane-detail-header">
                    <span class="swimlane-detail-color" style="background:${color}"></span>
                    <strong>${this._escapeHtml(evt.name)}</strong>
                    <button class="swimlane-detail-close" id="swimlane-detail-close">&times;</button>
                </div>
                <table class="swimlane-detail-table">
                    <tr><td>类别</td><td>${this._escapeHtml(evt.cat)}</td></tr>
                    <tr><td>开始时间</td><td>${formatTime(evt.ts)}</td></tr>
                    <tr><td>持续时间</td><td>${formatTime(evt.dur)}</td></tr>
                    <tr><td>模块</td><td>${this._escapeHtml(layout.lane.label)}</td></tr>
                    <tr><td>子泳道</td><td>${this._escapeHtml(layout.sublane.label)}</td></tr>
                    ${argsRows}
                </table>
                <div class="swimlane-detail-actions">
                    <button class="btn btn-primary btn-sm" id="swimlane-detail-ask-ai">询问 AI</button>
                </div>
            `;
            this.container.appendChild(panel);

            document.getElementById('swimlane-detail-close').addEventListener('click', () => {
                this.clickedEvent = null;
                this.clickedLayout = null;
                this._hideDetailPanel();
                this._scheduleRender();
            });

            document.getElementById('swimlane-detail-ask-ai').addEventListener('click', () => {
                const ctx = `用户在 Trace 泳道图中点击了一个算子:\n` +
                    `名称: ${evt.name}\n类别: ${evt.cat}\n` +
                    `开始时间: ${formatTime(evt.ts)}\n持续时间: ${formatTime(evt.dur)}\n` +
                    `模块: ${layout.lane.label}\n子泳道: ${layout.sublane.label}`;
                const q = `请分析算子 "${evt.name}" (耗时 ${formatTime(evt.dur)}) 的性能表现，可能的优化方向是什么？`;
                this._triggerAskAI(ctx, q);
            });
        }

        _hideDetailPanel() {
            const old = document.getElementById('swimlane-detail-panel');
            if (old) old.remove();
        }

        _escapeHtml(s) {
            const d = document.createElement('div');
            d.textContent = s;
            return d.innerHTML;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 选区 + AI (issue #4 修复)
        // ═══════════════════════════════════════════════════════════════════════
        _computeSelectedEvents() {
            this.selectedEvents = [];
            if (!this.selectionRect) return;
            const sr = this.selectionRect;
            const xMin = Math.min(sr.x1, sr.x2), xMax = Math.max(sr.x1, sr.x2);
            const yMin = Math.min(sr.y1, sr.y2), yMax = Math.max(sr.y1, sr.y2);
            const tStart = this._xToTime(xMin), tEnd = this._xToTime(xMax);
            const oY = -this.scrollY;

            for (const layout of this._sublaneLayout) {
                const ly = layout.y + oY;
                if (ly + layout.height < yMin || ly > yMax) continue;
                const events = layout.sublane.events;
                const si = Math.max(0, bisectLeft(events, tStart) - 1);
                for (let i = si; i < events.length; i++) {
                    const evt = events[i];
                    if (evt.ts > tEnd) break;
                    if (evt.ts + evt.dur >= tStart && evt.ts <= tEnd) {
                        this.selectedEvents.push({ evt, layout });
                    }
                }
            }
        }

        _showSelectionPopup() {
            if (this.selectedEvents.length === 0) return;
            this._hideSelectionPopup();

            const allSel = this.selectedEvents;
            const evts = allSel.map(e => e.evt);
            const totalDur = evts.reduce((s, e) => s + e.dur, 0);
            const minTs = Math.min(...evts.map(e => e.ts));
            const maxTs = Math.max(...evts.map(e => e.ts + e.dur));
            const mods = new Set();
            allSel.forEach(({ layout }) => mods.add(layout.lane.label));

            // 构建 AI context
            const topEvents = [...allSel].sort((a, b) => b.evt.dur - a.evt.dur).slice(0, 50);
            let contextText = `用户在 Trace 泳道图中框选了以下区域:\n`;
            contextText += `时间范围: ${formatTime(minTs)} - ${formatTime(maxTs)}\n`;
            contextText += `涉及模块: ${[...mods].join(', ')}\n`;
            contextText += `共 ${evts.length} 个事件, 总耗时 ${formatTime(totalDur)}\n\n`;
            contextText += `Top 事件 (按耗时排序):\n| 名称 | 类别 | 耗时 | 模块 |\n| --- | --- | --- | --- |\n`;
            for (const { evt, layout } of topEvents) {
                contextText += `| ${evt.name} | ${evt.cat} | ${formatTime(evt.dur)} | ${layout.lane.label} |\n`;
            }

            // 分页状态
            const PAGE_SIZE = 10;
            const sorted = [...allSel].sort((a, b) => b.evt.dur - a.evt.dur);
            let page = 0;
            const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
            const self = this;

            const popup = document.createElement('div');
            popup.className = 'swimlane-selection-popup swimlane-sel-list';
            popup.id = 'swimlane-selection-popup';

            function renderPopup() {
                const start = page * PAGE_SIZE;
                const pageItems = sorted.slice(start, start + PAGE_SIZE);

                let listHtml = '';
                for (let i = 0; i < pageItems.length; i++) {
                    const { evt, layout } = pageItems[i];
                    const color = nameToColor(evt.name);
                    const idx = start + i;
                    listHtml += `<div class="swimlane-sel-item" data-idx="${idx}">
                        <span class="swimlane-sel-color" style="background:${color}"></span>
                        <span class="swimlane-sel-name">${self._escapeHtml(evt.name)}</span>
                        <span class="swimlane-sel-dur">${formatTime(evt.dur)}</span>
                    </div>`;
                }

                popup.innerHTML = `
                    <div class="swimlane-sel-header">
                        选中 <strong>${evts.length}</strong> 个事件 |
                        ${formatTime(minTs)} - ${formatTime(maxTs)} |
                        ${[...mods].join(', ')}
                    </div>
                    <div class="swimlane-sel-body">${listHtml}</div>
                    <div class="swimlane-sel-footer">
                        <div class="swimlane-sel-pager">
                            <button class="btn btn-sm btn-secondary" id="swimlane-sel-prev" ${page === 0 ? 'disabled' : ''}>上一页</button>
                            <span>${page + 1} / ${totalPages}</span>
                            <button class="btn btn-sm btn-secondary" id="swimlane-sel-next" ${page >= totalPages - 1 ? 'disabled' : ''}>下一页</button>
                        </div>
                        <div class="swimlane-sel-actions">
                            <button class="btn btn-primary btn-sm" id="swimlane-ask-ai">询问 AI</button>
                            <button class="btn btn-secondary btn-sm" id="swimlane-clear-sel">清除</button>
                        </div>
                    </div>`;

                // 绑定分页
                const prevBtn = popup.querySelector('#swimlane-sel-prev');
                const nextBtn = popup.querySelector('#swimlane-sel-next');
                if (prevBtn) prevBtn.addEventListener('click', () => { page--; renderPopup(); });
                if (nextBtn) nextBtn.addEventListener('click', () => { page++; renderPopup(); });

                // 绑定列表项点击 → 显示详情
                popup.querySelectorAll('.swimlane-sel-item').forEach(el => {
                    el.addEventListener('click', () => {
                        const idx = parseInt(el.dataset.idx);
                        const { evt, layout } = sorted[idx];
                        self.clickedEvent = evt;
                        self.clickedLayout = layout;
                        self._showDetailPanel(evt, layout);
                        self._scheduleRender();
                    });

                    // hover 显示详细信息浮窗（包含 Dtype / Shape）
                    el.addEventListener('mouseenter', (e) => {
                        self._hideItemTooltip();
                        const idx = parseInt(el.dataset.idx);
                        const { evt, layout } = sorted[idx];
                        const args = evt.args || {};
                        let html = `<div class="swimlane-item-tip-title">${self._escapeHtml(evt.name)}</div>`;
                        html += `<div class="swimlane-item-tip-row">类别: ${self._escapeHtml(evt.cat)}</div>`;
                        html += `<div class="swimlane-item-tip-row">耗时: ${formatTime(evt.dur)}</div>`;
                        html += `<div class="swimlane-item-tip-row">开始: ${formatTime(evt.ts)}</div>`;
                        html += `<div class="swimlane-item-tip-row">模块: ${self._escapeHtml(layout.lane.label)}</div>`;
                        html += `<div class="swimlane-item-tip-row">泳道: ${self._escapeHtml(layout.sublane.label)}</div>`;
                        if (args['Input type']) html += `<div class="swimlane-item-tip-row"><strong>Dtype:</strong> ${self._escapeHtml(args['Input type'])}</div>`;
                        if (args['Input Dims']) html += `<div class="swimlane-item-tip-row"><strong>Shape:</strong> ${self._escapeHtml(args['Input Dims'])}</div>`;
                        if (args['Task Type']) html += `<div class="swimlane-item-tip-row">Task Type: ${self._escapeHtml(args['Task Type'])}</div>`;

                        const tip = document.createElement('div');
                        tip.className = 'swimlane-item-tooltip';
                        tip.id = 'swimlane-item-tooltip';
                        tip.innerHTML = html;
                        popup.appendChild(tip);

                        // 定位在列表项左侧
                        const rect = el.getBoundingClientRect();
                        const popRect = popup.getBoundingClientRect();
                        tip.style.top = (rect.top - popRect.top) + 'px';
                        tip.style.right = (popRect.width + 8) + 'px';
                    });
                    el.addEventListener('mouseleave', () => self._hideItemTooltip());
                });

                // 绑定 AI / 清除
                popup.querySelector('#swimlane-ask-ai').addEventListener('click', () => {
                    const autoQ = `请分析这段 Trace 选区中的 ${evts.length} 个事件，识别性能瓶颈和优化建议。`;
                    self._triggerAskAI(contextText, autoQ);
                });
                popup.querySelector('#swimlane-clear-sel').addEventListener('click', () => {
                    self.selectionRect = null;
                    self.selectedEvents = [];
                    self._hideSelectionPopup();
                    self._scheduleRender();
                });
            }

            this.container.appendChild(popup);
            renderPopup();
        }

        _hideSelectionPopup() {
            const old = document.getElementById('swimlane-selection-popup');
            if (old) old.remove();
            this._hideItemTooltip();
        }

        _hideItemTooltip() {
            const old = document.getElementById('swimlane-item-tooltip');
            if (old) old.remove();
        }

        // ─── 统一的 AI 询问方法 (issue #4 修复) ───
        _triggerAskAI(contextText, question) {
            // 方法1: 直接用 window.askAIAboutSelection（由 questions.js 提供）
            if (window.askAIAboutSelection) {
                window.askAIAboutSelection(contextText, question);
                return;
            }
            // 方法2: 直接操作 chat 面板（fallback）
            const input = document.getElementById('chat-input');
            const chatPanel = document.getElementById('chat-panel');
            if (input && chatPanel) {
                // 确保聊天面板可见
                if (typeof window.switchPanel === 'function') window.switchPanel('chat');
                // 存入全局上下文
                window.__selectionContext = contextText;
                input.value = question;
                input.focus();
                // 触发发送
                setTimeout(() => {
                    if (window.sendChatMessage) {
                        window.sendChatMessage();
                    } else {
                        const sendBtn = document.getElementById('chat-send');
                        if (sendBtn) sendBtn.click();
                    }
                }, 150);
            }
        }

        // ─── 公开方法 ───
        setSelectionMode(enabled) {
            this.selectionMode = enabled;
            this.container.style.cursor = enabled ? 'crosshair' : 'default';
        }

        resetView() {
            this.viewportStart = this.data.timeRange.start;
            this.viewportEnd = this.data.timeRange.end || 1;
            this.scrollY = 0;
            this.selectionRect = null;
            this.selectedEvents = [];
            this.clickedEvent = null;
            this.clickedLayout = null;
            this._hideSelectionPopup();
            this._hideDetailPanel();
            this._scheduleRender();
        }

        destroy() {
            if (this._resizeObserver) this._resizeObserver.disconnect();
            document.removeEventListener('keydown', this._onKeyDown);
            document.removeEventListener('keyup', this._onKeyUp);
            this._hideSelectionPopup();
            this._hideDetailPanel();
            this.container.innerHTML = '';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 初始化入口
    // ═══════════════════════════════════════════════════════════════════════════
    window.SwimlaneViewer = SwimlaneViewer;

    window.loadSwimlaneTrace = async function (jobId) {
        const container = document.getElementById('swimlane-container');
        const statusEl = document.getElementById('swimlane-status');
        const btn = document.getElementById('trace-open-btn');
        if (!container) return;

        if (btn) btn.disabled = true;
        if (statusEl) statusEl.textContent = '正在加载泳道数据...';

        try {
            const resp = await fetch('/api/jobs/' + jobId + '/swimlane');
            if (!resp.ok) throw new Error(resp.statusText || '加载失败');
            const data = await resp.json();

            if (!data.lanes || data.lanes.length === 0) {
                if (statusEl) statusEl.textContent = '未找到 Trace 数据。';
                if (btn) btn.disabled = false;
                return;
            }

            let totalEvents = 0;
            for (const lane of data.lanes)
                for (const sub of lane.sublanes) totalEvents += sub.events.length;

            container.style.display = 'block';
            const toolbar = document.getElementById('swimlane-toolbar');
            if (toolbar) toolbar.style.display = 'flex';
            if (btn) btn.style.display = 'none';
            if (statusEl) {
                let t = `${data.lanes.length} 个模块, ${totalEvents} 个事件`;
                if (data.filtered) t += ` (已过滤 dur < ${data.minDurFilter}μs，原始 ${data.totalOriginal} 个)`;
                statusEl.textContent = t;
            }

            const viewer = new SwimlaneViewer(container, data);
            window.__swimlaneViewer = viewer;

            const resetBtn = document.getElementById('swimlane-reset');
            if (resetBtn) resetBtn.addEventListener('click', () => viewer.resetView());

            const selBtn = document.getElementById('swimlane-select-mode');
            if (selBtn) {
                selBtn.addEventListener('click', () => {
                    const active = selBtn.classList.toggle('active');
                    viewer.setSelectionMode(active);
                });
            }

            // 图例（用调色板颜色展示 top 算子名称）
            const legendEl = document.getElementById('swimlane-legend');
            if (legendEl) {
                legendEl.innerHTML = '';
                // 收集 top 算子名
                const nameCounts = {};
                for (const lane of data.lanes)
                    for (const sub of lane.sublanes)
                        for (const e of sub.events) nameCounts[e.name] = (nameCounts[e.name] || 0) + 1;
                const topNames = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
                for (const [name] of topNames) {
                    const span = document.createElement('span');
                    span.className = 'swimlane-legend-item';
                    span.innerHTML = `<span class="swimlane-legend-dot" style="background:${nameToColor(name)}"></span>${name}`;
                    legendEl.appendChild(span);
                }
            }
        } catch (err) {
            if (statusEl) statusEl.textContent = '加载失败: ' + err.message;
            if (btn) btn.disabled = false;
        }
    };
})();
