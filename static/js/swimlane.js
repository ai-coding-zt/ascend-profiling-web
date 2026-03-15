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

    // ─── Perfetto 风格 WASD 常量 ───
    const PAN_PX_PER_FRAME = 12;       // A/D 每帧平移像素
    const ZOOM_RATIO_PER_FRAME = 0.012; // W/S 每帧缩放比例
    const SCROLL_PX_PER_FRAME = 10;    // Q/E 每帧垂直滚动像素

    // ─── 颜色工具 ───
    function hashStr(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        return h;
    }

    function adjustColor(baseHex, name) {
        const h = Math.abs(hashStr(name));
        const adj = (h % 30) - 15;
        const r = parseInt(baseHex.slice(1, 3), 16);
        const g = parseInt(baseHex.slice(3, 5), 16);
        const b = parseInt(baseHex.slice(5, 7), 16);
        const clamp = v => Math.max(40, Math.min(220, v + adj));
        return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
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
    // SwimlaneViewer 主类
    // ═══════════════════════════════════════════════════════════════════════════
    class SwimlaneViewer {
        constructor(container, data) {
            this.container = container;
            this.data = data;
            this.lanes = data.lanes || [];
            this.categories = data.categories || {};

            // 视口
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

            // 鼠标拖拽（仅用于选区）
            this._dragStart = null;

            // WASD 按键状态
            this._keysDown = new Set();
            this._animating = false;

            // 缓存 CSS 颜色
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
            // 保留非-canvas 子元素（如选区弹窗）
            const popups = this.container.querySelectorAll('.swimlane-selection-popup');
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
            this._cssColors = null; // 重新获取
        }

        // ─── CSS 颜色缓存 ───
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

            // ─── 鼠标滚轮 → 垂直滚动（不缩放） ───
            el.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.scrollY += e.deltaY;
                this._clampScrollY();
                this._scheduleRender();
            }, { passive: false });

            // ─── 鼠标按下 → 选区拖拽 ───
            el.addEventListener('mousedown', (e) => {
                const rect = el.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                // 选区模式 或 Shift 拖拽
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

            // 双击重置
            el.addEventListener('dblclick', () => this.resetView());

            // 鼠标离开
            el.addEventListener('mouseleave', () => {
                this.hoverEvent = null;
                this.hoverPos = null;
                this._scheduleRender();
            });

            // ─── WASD 键盘控制 (Perfetto 风格) ───
            // 使用 KeyboardEvent.code 以物理键位为准
            this._onKeyDown = (e) => {
                // 忽略输入框中的按键
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
                    e.target.isContentEditable) return;
                if (e.ctrlKey || e.metaKey || e.altKey) return;

                const code = e.code;
                if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE'].includes(code)) {
                    e.preventDefault();
                    this._keysDown.add(code);
                    this._startAnimation();
                }
                // F = 重置视口 (Fit)
                if (code === 'KeyF') {
                    e.preventDefault();
                    this.resetView();
                }
            };

            this._onKeyUp = (e) => {
                this._keysDown.delete(e.code);
            };

            document.addEventListener('keydown', this._onKeyDown);
            document.addEventListener('keyup', this._onKeyUp);

            // 窗口大小变化
            this._resizeObserver = new ResizeObserver(() => {
                this._createCanvases();
                this._scheduleRender();
            });
            this._resizeObserver.observe(this.container);
        }

        // ─── WASD 动画循环 ───
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
            const dt = Math.min(now - this._lastAnimTime, 50); // cap at 50ms
            this._lastAnimTime = now;
            const dtNorm = dt / 16.67; // normalize to 60fps

            const range = this.viewportEnd - this.viewportStart;
            const panAmount = (PAN_PX_PER_FRAME / this._eventAreaWidth()) * range * dtNorm;

            let needRender = false;

            // W = zoom in (缩小时间范围，放大细节)
            if (this._keysDown.has('KeyW')) {
                const factor = 1 - ZOOM_RATIO_PER_FRAME * dtNorm;
                this._zoomCenter(factor);
                needRender = true;
            }
            // S = zoom out
            if (this._keysDown.has('KeyS')) {
                const factor = 1 + ZOOM_RATIO_PER_FRAME * dtNorm;
                this._zoomCenter(factor);
                needRender = true;
            }
            // A = pan left
            if (this._keysDown.has('KeyA')) {
                this.viewportStart -= panAmount;
                this.viewportEnd -= panAmount;
                this._clampViewport();
                needRender = true;
            }
            // D = pan right
            if (this._keysDown.has('KeyD')) {
                this.viewportStart += panAmount;
                this.viewportEnd += panAmount;
                this._clampViewport();
                needRender = true;
            }
            // Q = scroll up
            if (this._keysDown.has('KeyQ')) {
                this.scrollY -= SCROLL_PX_PER_FRAME * dtNorm;
                this._clampScrollY();
                needRender = true;
            }
            // E = scroll down
            if (this._keysDown.has('KeyE')) {
                this.scrollY += SCROLL_PX_PER_FRAME * dtNorm;
                this._clampScrollY();
                needRender = true;
            }

            if (needRender) this._scheduleRender();
            requestAnimationFrame(() => this._animLoop());
        }

        // ─── 视口辅助 ───
        _eventAreaWidth() {
            return Math.max(1, this._width - LANE_HEADER_WIDTH);
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

        _zoomCenter(factor) {
            // 以视口中心为锚点缩放
            const mid = (this.viewportStart + this.viewportEnd) / 2;
            const halfRange = (this.viewportEnd - this.viewportStart) / 2 * factor;
            if (halfRange < 0.005) return; // 最小范围
            const maxHalf = (this.data.timeRange.end - this.data.timeRange.start);
            if (halfRange > maxHalf) return;
            this.viewportStart = mid - halfRange;
            this.viewportEnd = mid + halfRange;
        }

        _clampViewport() {
            const range = this.viewportEnd - this.viewportStart;
            const gs = this.data.timeRange.start;
            const ge = this.data.timeRange.end;
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

        // ═══════════════════════════════════════════════════════════════════════
        // 背景层
        // ═══════════════════════════════════════════════════════════════════════
        _renderBg() {
            const ctx = this.bgCtx;
            const w = this._width;
            const h = this._height;
            const c = this._getColors();
            const oY = -this.scrollY;

            ctx.clearRect(0, 0, w, h);

            // 整体背景
            ctx.fillStyle = c.bg;
            ctx.fillRect(0, 0, w, h);

            // 时间轴区域
            ctx.fillStyle = c.bgSec;
            ctx.fillRect(LANE_HEADER_WIDTH, 0, w - LANE_HEADER_WIDTH, TIME_AXIS_HEIGHT);

            // 时间轴刻度
            const range = this.viewportEnd - this.viewportStart;
            const maxTicks = Math.floor(this._eventAreaWidth() / 100);
            const step = niceStep(range, maxTicks);
            const firstTick = Math.ceil(this.viewportStart / step) * step;

            ctx.font = '11px "Roboto Condensed", -apple-system, sans-serif';
            ctx.textAlign = 'center';

            for (let t = firstTick; t <= this.viewportEnd; t += step) {
                const x = this._timeToX(t);
                if (x < LANE_HEADER_WIDTH || x > w) continue;

                // 刻度线
                ctx.strokeStyle = c.border;
                ctx.beginPath();
                ctx.moveTo(x, TIME_AXIS_HEIGHT - 6);
                ctx.lineTo(x, TIME_AXIS_HEIGHT);
                ctx.stroke();

                // 网格线
                ctx.save();
                ctx.globalAlpha = 0.2;
                ctx.strokeStyle = c.border;
                ctx.beginPath();
                ctx.moveTo(x, TIME_AXIS_HEIGHT);
                ctx.lineTo(x, h);
                ctx.stroke();
                ctx.restore();

                // 刻度文字
                ctx.fillStyle = c.textSec;
                ctx.fillText(formatTime(t), x, TIME_AXIS_HEIGHT - 10);
            }

            // 左侧面板
            ctx.fillStyle = c.bgSec;
            ctx.fillRect(0, 0, LANE_HEADER_WIDTH, h);

            // 泳道标签
            for (const layout of this._sublaneLayout) {
                const y = layout.y + oY;
                if (y + layout.height < TIME_AXIS_HEIGHT || y > h) continue;

                ctx.fillStyle = c.textSec;
                ctx.font = '10px "Roboto Condensed", -apple-system, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(layout.sublane.label, LANE_HEADER_WIDTH - 8, y + layout.height / 2 + 3, LANE_HEADER_WIDTH - 12);

                // 分隔线
                ctx.strokeStyle = c.border;
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.moveTo(LANE_HEADER_WIDTH, y + layout.height);
                ctx.lineTo(w, y + layout.height);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            // Lane 组标题（模块名）
            let prevLane = null;
            for (const layout of this._sublaneLayout) {
                if (layout.lane === prevLane) continue;
                prevLane = layout.lane;
                const y = layout.y + oY - LANE_TITLE_HEIGHT;
                if (y + LANE_TITLE_HEIGHT < TIME_AXIS_HEIGHT || y > h) continue;

                // 模块标题背景
                ctx.fillStyle = c.bgSec;
                ctx.fillRect(0, y, w, LANE_TITLE_HEIGHT);

                ctx.fillStyle = c.text;
                ctx.font = 'bold 12px "Roboto Condensed", -apple-system, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(layout.lane.label, 10, y + LANE_TITLE_HEIGHT - 8);

                // 分隔线
                ctx.strokeStyle = c.border;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            // 边框
            ctx.strokeStyle = c.border;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(LANE_HEADER_WIDTH, 0);
            ctx.lineTo(LANE_HEADER_WIDTH, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, TIME_AXIS_HEIGHT);
            ctx.lineTo(w, TIME_AXIS_HEIGHT);
            ctx.stroke();
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 事件层 — Perfetto 风格 4-pass 渲染
        // ═══════════════════════════════════════════════════════════════════════
        _renderEvents() {
            const ctx = this.eventCtx;
            const w = this._width;
            const h = this._height;
            ctx.clearRect(0, 0, w, h);

            const vpStart = this.viewportStart;
            const vpEnd = this.viewportEnd;
            const oY = -this.scrollY;

            // Pass 1: 收集可见矩形 + Pass 2: 按颜色批量填充
            // 合并为单 pass 以减少内存分配
            for (const layout of this._sublaneLayout) {
                const y = layout.y + oY;
                if (y + layout.height < TIME_AXIS_HEIGHT || y > h) continue;

                const events = layout.sublane.events;
                if (!events.length) continue;

                let startIdx = bisectLeft(events, vpStart);
                startIdx = Math.max(0, startIdx - 1);

                for (let i = startIdx; i < events.length; i++) {
                    const evt = events[i];
                    if (evt.ts > vpEnd) break;
                    const evtEnd = evt.ts + evt.dur;
                    if (evtEnd < vpStart) continue;

                    const x1 = Math.max(LANE_HEADER_WIDTH, this._timeToX(evt.ts));
                    const x2 = Math.min(w, this._timeToX(evtEnd));
                    const rw = Math.max(1, x2 - x1);

                    // 颜色
                    const catInfo = this.categories[evt.cat];
                    const baseColor = catInfo ? catInfo.color : '#95a5a6';
                    const color = adjustColor(baseColor, evt.name);

                    // Perfetto 风格: 填充 + 1px 间距
                    ctx.fillStyle = color;
                    ctx.fillRect(x1, y + 1, rw, layout.height - 2);

                    // 文字（Perfetto: 居中, Roboto Condensed 12px, 最小 5px 宽才显示）
                    if (rw > MIN_TEXT_WIDTH) {
                        ctx.fillStyle = '#FFFFFF';
                        ctx.font = '10px "Roboto Condensed", -apple-system, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(x1, y + 1, rw, layout.height - 2);
                        ctx.clip();
                        ctx.fillText(evt.name, x1 + rw / 2, y + layout.height / 2 + 3);
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
            const w = this._width;
            const h = this._height;
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

            // 选中事件高亮 (Perfetto 风格: 3px 边框)
            if (this.selectedEvents.length > 0) {
                ctx.strokeStyle = 'rgba(37, 99, 235, 0.85)';
                ctx.lineWidth = 2;
                const oY = -this.scrollY;
                for (const { evt, layout } of this.selectedEvents) {
                    const x1 = Math.max(LANE_HEADER_WIDTH, this._timeToX(evt.ts));
                    const x2 = Math.min(w, this._timeToX(evt.ts + evt.dur));
                    const rw = Math.max(1, x2 - x1);
                    const y = layout.y + oY;
                    ctx.strokeRect(x1 - 1, y, rw + 2, layout.height);
                }
            }

            // Hover tooltip
            if (this.hoverEvent && this.hoverPos) {
                this._renderTooltip(ctx);
            }

            // WASD 快捷键提示（左下角，半透明）
            if (this._keysDown.size > 0) {
                const c = this._getColors();
                ctx.fillStyle = c.textLight;
                ctx.font = '10px "Roboto Condensed", -apple-system, sans-serif';
                ctx.textAlign = 'left';
                const keys = [...this._keysDown].map(k => k.replace('Key', '')).join('+');
                ctx.fillText(keys, LANE_HEADER_WIDTH + 8, h - 8);
            }
        }

        _renderTooltip(ctx) {
            const evt = this.hoverEvent;
            const pos = this.hoverPos;
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

            ctx.font = '12px "Roboto Condensed", -apple-system, sans-serif';
            const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
            const tipW = maxW + TOOLTIP_PAD * 2;
            const tipH = lines.length * 16 + TOOLTIP_PAD * 2;

            let tipX = pos.x + 12, tipY = pos.y + 12;
            if (tipX + tipW > this._width) tipX = pos.x - tipW - 8;
            if (tipY + tipH > this._height) tipY = pos.y - tipH - 8;

            const c = this._getColors();
            ctx.fillStyle = c.bgElev;
            ctx.strokeStyle = c.border;
            ctx.lineWidth = 1;
            ctx.shadowColor = 'rgba(0,0,0,0.12)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(tipX, tipY, tipW, tipH, 6);
            else ctx.rect(tipX, tipY, tipW, tipH);
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.fillStyle = c.text;
            ctx.textAlign = 'left';
            for (let i = 0; i < lines.length; i++) {
                ctx.font = i === 0
                    ? 'bold 12px "Roboto Condensed", -apple-system, sans-serif'
                    : '11px "Roboto Condensed", -apple-system, sans-serif';
                ctx.fillText(lines[i], tipX + TOOLTIP_PAD, tipY + TOOLTIP_PAD + 12 + i * 16);
            }
        }

        // ─── Hover ───
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

        // ─── 选区 ───
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

            const evts = this.selectedEvents.map(e => e.evt);
            const totalDur = evts.reduce((s, e) => s + e.dur, 0);
            const minTs = Math.min(...evts.map(e => e.ts));
            const maxTs = Math.max(...evts.map(e => e.ts + e.dur));
            const devices = new Set();
            this.selectedEvents.forEach(({ layout }) => devices.add(layout.lane.label));

            const topEvents = [...evts].sort((a, b) => b.dur - a.dur).slice(0, 50);
            let contextText = `用户在 Trace 泳道图中框选了以下区域:\n`;
            contextText += `时间范围: ${formatTime(minTs)} - ${formatTime(maxTs)}\n`;
            contextText += `涉及模块: ${[...devices].join(', ')}\n`;
            contextText += `共 ${evts.length} 个事件, 总耗时 ${formatTime(totalDur)}\n\n`;
            contextText += `Top 事件 (按耗时排序):\n| 名称 | 类别 | 耗时 | 模块 |\n| --- | --- | --- | --- |\n`;
            for (const e of topEvents) {
                const mod = this.selectedEvents.find(se => se.evt === e)?.layout.lane.label || '';
                contextText += `| ${e.name} | ${e.cat} | ${formatTime(e.dur)} | ${mod} |\n`;
            }

            const popup = document.createElement('div');
            popup.className = 'swimlane-selection-popup';
            popup.id = 'swimlane-selection-popup';
            const sr = this.selectionRect;
            popup.style.left = Math.max(LANE_HEADER_WIDTH, Math.min(sr.x1, sr.x2)) + 'px';
            popup.style.top = Math.min(Math.max(sr.y1, sr.y2) + 8, this._height - 80) + 'px';

            popup.innerHTML = `
                <div class="swimlane-selection-summary">
                    选中 <strong>${evts.length}</strong> 个事件 |
                    ${formatTime(minTs)} - ${formatTime(maxTs)} |
                    ${[...devices].join(', ')}
                </div>
                <div class="swimlane-selection-actions">
                    <button class="btn btn-primary btn-sm" id="swimlane-ask-ai">询问 AI</button>
                    <button class="btn btn-secondary btn-sm" id="swimlane-clear-sel">清除选区</button>
                </div>`;
            this.container.appendChild(popup);
            if (window.lucide) lucide.createIcons({ nodes: [popup] });

            document.getElementById('swimlane-ask-ai').addEventListener('click', () => {
                const autoQ = `请分析这段 Trace 选区中的 ${evts.length} 个事件，识别性能瓶颈和优化建议。`;
                if (window.askAIAboutSelection) window.askAIAboutSelection(contextText, autoQ);
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
            this.container.style.cursor = enabled ? 'crosshair' : 'default';
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
            document.removeEventListener('keydown', this._onKeyDown);
            document.removeEventListener('keyup', this._onKeyUp);
            this._hideSelectionPopup();
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
            for (const lane of data.lanes) {
                for (const sub of lane.sublanes) totalEvents += sub.events.length;
            }

            container.style.display = 'block';
            const toolbar = document.getElementById('swimlane-toolbar');
            if (toolbar) toolbar.style.display = 'flex';
            if (btn) btn.style.display = 'none';
            if (statusEl) {
                let t = `${data.lanes.length} 个模块, ${totalEvents} 个事件`;
                if (data.filtered) {
                    t += ` (已过滤 dur < ${data.minDurFilter}μs，原始 ${data.totalOriginal} 个)`;
                }
                statusEl.textContent = t;
            }

            const viewer = new SwimlaneViewer(container, data);
            window.__swimlaneViewer = viewer;

            // 工具栏
            const resetBtn = document.getElementById('swimlane-reset');
            if (resetBtn) resetBtn.addEventListener('click', () => viewer.resetView());

            const selBtn = document.getElementById('swimlane-select-mode');
            if (selBtn) {
                selBtn.addEventListener('click', () => {
                    const active = selBtn.classList.toggle('active');
                    viewer.setSelectionMode(active);
                });
            }

            // 图例
            const legendEl = document.getElementById('swimlane-legend');
            if (legendEl && data.categories) {
                legendEl.innerHTML = '';
                for (const [, info] of Object.entries(data.categories)) {
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
