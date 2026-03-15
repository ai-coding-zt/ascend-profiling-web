/* ─── AI Chat Panel (Full-width, Left Panel) ─── */

(function() {
    const chatPanel = document.getElementById('chat-panel');
    const input = document.getElementById('chat-input');
    const messagesDiv = document.getElementById('chat-messages');
    const imagesDiv = document.getElementById('chat-images');
    const fileInput = document.getElementById('chat-file-input');
    if (!chatPanel || !input) return;

    let imagePaths = [];
    const CHAT_STORAGE_KEY = 'ascend_profiling_chat_' + (window.__JOB_ID__ || 'default');

    // ─── Chat Session Persistence ───
    function saveChatSession() {
        try {
            const msgs = [];
            messagesDiv.querySelectorAll('.chat-msg').forEach(el => {
                if (el.id === 'chat-typing') return; // skip thinking indicator
                const isBot = el.classList.contains('chat-msg-bot');
                const contentEl = el.querySelector('.chat-msg-content');
                if (!contentEl) return;
                const imgEls = el.querySelectorAll('.chat-msg-images img');
                const images = Array.from(imgEls).map(img => img.src);
                msgs.push({
                    type: isBot ? 'bot' : 'user',
                    // For bot messages, store the innerHTML (rendered markdown)
                    // For user messages, store text content
                    content: isBot ? contentEl.innerHTML : contentEl.textContent,
                    html: isBot,
                    images,
                });
            });
            // Also save the summary card if present
            const summaryCard = messagesDiv.querySelector('.chat-summary-card');
            if (summaryCard) {
                msgs.unshift({ type: 'summary', content: summaryCard.innerHTML });
            }
            localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs));
        } catch (e) {
            // localStorage may be full or unavailable
        }
    }

    function loadChatSession() {
        try {
            const stored = localStorage.getItem(CHAT_STORAGE_KEY);
            if (!stored) return false;
            const msgs = JSON.parse(stored);
            if (!msgs || msgs.length <= 1) return false; // only welcome msg, skip

            // Clear default welcome message
            messagesDiv.innerHTML = '';

            for (const msg of msgs) {
                if (msg.type === 'summary') {
                    const summaryDiv = document.createElement('div');
                    summaryDiv.className = 'chat-summary-card';
                    summaryDiv.innerHTML = msg.content;
                    messagesDiv.appendChild(summaryDiv);
                    continue;
                }
                const el = document.createElement('div');
                el.className = 'chat-msg chat-msg-' + msg.type;
                const contentDiv = document.createElement('div');
                contentDiv.className = 'chat-msg-content' + (msg.type === 'bot' ? ' markdown-body' : '');
                if (msg.html) {
                    contentDiv.innerHTML = msg.content;
                } else {
                    contentDiv.textContent = msg.content;
                }
                el.appendChild(contentDiv);

                if (msg.images && msg.images.length > 0) {
                    const imgsDiv = document.createElement('div');
                    imgsDiv.className = 'chat-msg-images';
                    msg.images.forEach(url => {
                        const img = document.createElement('img');
                        img.src = url;
                        img.alt = '截图';
                        img.onclick = () => window.open(url);
                        imgsDiv.appendChild(img);
                    });
                    el.appendChild(imgsDiv);
                }
                messagesDiv.appendChild(el);
            }
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            if (window.lucide) lucide.createIcons();
            return true;
        } catch (e) {
            return false;
        }
    }

    // ─── Configure marked.js for Markdown rendering ───
    if (window.marked) {
        marked.setOptions({
            breaks: true,        // GFM line breaks
            gfm: true,           // GitHub Flavored Markdown
            headerIds: false,
            mangle: false,
        });
    }

    // ─── Markdown rendering helper ───
    function renderMarkdown(text) {
        if (window.marked && typeof marked.parse === 'function') {
            // Add section chip support: 【section_name】 → clickable chips
            let processed = text.replace(/【(.+?)】/g, '<a class="section-chip" onclick="scrollToSection(\'$1\')">$1</a>');
            try {
                return marked.parse(processed);
            } catch (e) {
                return fallbackFormat(text);
            }
        }
        return fallbackFormat(text);
    }

    // Fallback if marked.js not loaded
    function fallbackFormat(text) {
        let html = escapeHtml(text);
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/`(.+?)`/g, '<code>$1</code>');
        html = html.replace(/【(.+?)】/g, '<a class="section-chip" onclick="scrollToSection(\'$1\')">$1</a>');
        // Convert markdown list items to <ul><li>
        html = html.replace(/((?:^|\n)- .+(?:\n- .+)*)/g, function(block) {
            const items = block.trim().split('\n').map(line => '<li>' + line.replace(/^- /, '') + '</li>').join('');
            return '<ul>' + items + '</ul>';
        });
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    // ─── Resizable Divider ───
    const divider = document.getElementById('resize-divider');
    const dashboardPanel = document.getElementById('dashboard-panel');
    if (divider && dashboardPanel) {
        let isDragging = false;
        let startX = 0;
        let startWidth = 0;

        divider.addEventListener('mousedown', e => {
            isDragging = true;
            startX = e.clientX;
            startWidth = chatPanel.getBoundingClientRect().width;
            divider.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const delta = e.clientX - startX;
            const newWidth = Math.max(320, Math.min(startWidth + delta, window.innerWidth - 400));
            chatPanel.style.width = newWidth + 'px';
            chatPanel.style.minWidth = newWidth + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            divider.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.dispatchEvent(new Event('resize'));
        });
    }

    // ─── Mobile Panel Switching ───
    window.switchPanel = function(panel) {
        const chat = document.getElementById('chat-panel');
        const dashboard = document.getElementById('dashboard-panel');
        const tabs = document.querySelectorAll('.mobile-tab');

        chat.classList.remove('active-panel');
        dashboard.classList.remove('active-panel');
        tabs.forEach(t => t.classList.remove('active'));

        if (panel === 'chat') {
            chat.classList.add('active-panel');
        } else {
            dashboard.classList.add('active-panel');
        }

        const activeTab = document.querySelector(`.mobile-tab[data-panel="${panel}"]`);
        if (activeTab) activeTab.classList.add('active');
    };

    // ─── Keyboard: Enter to send, Shift+Enter for newline ───
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // ─── Clipboard Paste ───
    input.addEventListener('paste', async e => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                await uploadImage(item.getAsFile());
                break;
            }
        }
    });

    // ─── Drag-Drop Images ───
    input.addEventListener('dragover', e => { e.preventDefault(); });
    input.addEventListener('drop', async e => {
        e.preventDefault();
        for (const file of e.dataTransfer.files) {
            if (file.type.startsWith('image/')) await uploadImage(file);
        }
    });

    // ─── File Picker ───
    if (fileInput) {
        fileInput.addEventListener('change', async () => {
            for (const file of fileInput.files) await uploadImage(file);
            fileInput.value = '';
        });
    }

    async function uploadImage(blob) {
        const formData = new FormData();
        formData.append('file', blob, blob.name || 'screenshot.png');
        try {
            const resp = await fetch('/api/images', { method: 'POST', body: formData });
            if (!resp.ok) throw new Error(resp.statusText);
            const data = await resp.json();
            imagePaths.push(data.url);
            renderImagePreviews();
        } catch (err) {
            console.error('Image upload failed:', err);
        }
    }

    function renderImagePreviews() {
        imagesDiv.innerHTML = '';
        imagePaths.forEach((url, i) => {
            const img = document.createElement('img');
            img.src = url;
            img.title = '点击移除';
            img.addEventListener('click', () => {
                imagePaths.splice(i, 1);
                renderImagePreviews();
            });
            imagesDiv.appendChild(img);
        });
    }

    // ─── Add message to chat ───
    function addMessage(text, type, images) {
        const msg = document.createElement('div');
        msg.className = 'chat-msg chat-msg-' + type;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'chat-msg-content';
        if (type === 'bot') {
            contentDiv.classList.add('markdown-body');
            contentDiv.innerHTML = renderMarkdown(text);
        } else {
            contentDiv.textContent = text;
        }
        msg.appendChild(contentDiv);

        if (images && images.length > 0) {
            const imgsDiv = document.createElement('div');
            imgsDiv.className = 'chat-msg-images';
            images.forEach(url => {
                const img = document.createElement('img');
                img.src = url;
                img.alt = '截图';
                img.onclick = () => window.open(url);
                imgsDiv.appendChild(img);
            });
            msg.appendChild(imgsDiv);
        }

        messagesDiv.appendChild(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return msg;
    }

    function addStreamingMessage() {
        const msg = document.createElement('div');
        msg.className = 'chat-msg chat-msg-bot';
        const content = document.createElement('div');
        content.className = 'chat-msg-content markdown-body';
        msg.appendChild(content);
        messagesDiv.appendChild(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return content;
    }

    // ─── Thinking Indicator (replaces old typing dots) ───
    function addThinkingIndicator() {
        const msg = document.createElement('div');
        msg.className = 'chat-msg chat-msg-bot';
        msg.id = 'chat-typing';
        msg.innerHTML = '<div class="chat-thinking">' +
            '<div class="thinking-icon"><i data-lucide="loader" style="width:18px;height:18px;"></i></div>' +
            '<span>正在思考分析中</span>' +
            '<div class="thinking-dots"><span></span><span></span><span></span></div>' +
            '</div>';
        messagesDiv.appendChild(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        if (window.lucide) lucide.createIcons({ nodes: [msg] });
        return msg;
    }

    function removeThinkingIndicator() {
        const el = document.getElementById('chat-typing');
        if (el) el.remove();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ─── Scroll dashboard to section ───
    window.scrollToSection = function(sectionName) {
        const dashContent = document.getElementById('dashboard-content');
        if (!dashContent) return;

        const sections = dashContent.querySelectorAll('.report-section');
        for (const sec of sections) {
            const title = sec.querySelector('.section-title');
            if (title && title.textContent.includes(sectionName)) {
                sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                sec.classList.remove('highlighted');
                void sec.offsetWidth;
                sec.classList.add('highlighted');
                if (window.innerWidth <= 768) switchPanel('dashboard');
                break;
            }
        }
    };

    // ─── Ask AI about section (triggered from "问 AI" buttons) ───
    window.askAiAboutSection = function(sectionName) {
        input.value = '请分析「' + sectionName + '」部分的数据，有什么关键发现和优化建议？';
        input.focus();
        if (window.innerWidth <= 768) switchPanel('chat');
    };

    // ─── Auto-detect current report section ───
    function getCurrentSection() {
        const dashContent = document.getElementById('dashboard-content');
        if (!dashContent) return null;
        const sections = dashContent.querySelectorAll('.section-title');
        for (const s of sections) {
            const rect = s.getBoundingClientRect();
            if (rect.top >= 0 && rect.top < window.innerHeight) {
                return s.textContent.replace(/问 AI$/, '').trim();
            }
        }
        return null;
    }

    // ─── Send Message (Streaming Agent Response) ───
    window.sendChatMessage = async function() {
        const text = input.value.trim();
        if (!text && imagePaths.length === 0) return;

        const sendBtn = document.getElementById('chat-send');
        sendBtn.disabled = true;

        // Show user message
        addMessage(text || '(截图)', 'user', [...imagePaths]);

        const context = getCurrentSection();
        const msgImages = [...imagePaths];

        input.value = '';
        imagePaths = [];
        imagesDiv.innerHTML = '';

        // Show thinking indicator
        addThinkingIndicator();

        try {
            const resp = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    job_id: window.__JOB_ID__ || null,
                    message: text,
                    context: context,
                    image_paths: msgImages,
                }),
            });

            if (!resp.ok) {
                removeThinkingIndicator();
                addMessage('发送失败，请重试。', 'bot');
                sendBtn.disabled = false;
                input.focus();
                return;
            }

            // Stream the response with Markdown rendering (token-level SSE)
            // Keep the thinking indicator visible until we get the first text chunk
            let contentEl = null;
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let renderPending = false;
            let lastRenderLen = 0;

            function doRender() {
                if (!contentEl || fullText.length === lastRenderLen) return;
                lastRenderLen = fullText.length;
                contentEl.innerHTML = renderMarkdown(fullText);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
                renderPending = false;
            }

            function scheduleRender() {
                if (!renderPending) {
                    renderPending = true;
                    requestAnimationFrame(doRender);
                }
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const payload = line.slice(6).trim();
                    if (payload === '[DONE]') continue;

                    try {
                        const data = JSON.parse(payload);
                        if (data.text) {
                            // First real text → remove thinking, create message bubble
                            if (!contentEl) {
                                removeThinkingIndicator();
                                contentEl = addStreamingMessage();
                            }
                            fullText += data.text;
                            scheduleRender();
                        }
                    } catch (e) {
                        // Skip malformed JSON
                    }
                }
            }
            // Final render to ensure all text is displayed
            doRender();

            // If stream ended without any text, still remove thinking and show fallback
            if (!contentEl) {
                removeThinkingIndicator();
                contentEl = addStreamingMessage();
            }
            if (!fullText.trim()) {
                contentEl.innerHTML = renderMarkdown('抱歉，暂时无法回答。请稍后再试。');
            }

            if (window.lucide) lucide.createIcons();
            saveChatSession();

        } catch (err) {
            removeThinkingIndicator();
            addMessage('网络错误，请检查连接后重试。', 'bot');
            console.error(err);
            saveChatSession();
        }

        sendBtn.disabled = false;
        input.focus();
    };

    // ─── Auto-Summary on Report Load ───
    function triggerAutoSummary() {
        const report = window.__REPORT__;
        if (!report) return;

        const summaryParts = [];

        if (report.op_analysis && report.op_analysis.length > 0) {
            const op = report.op_analysis[0];
            summaryParts.push('总共 **' + op.total_ops + '** 个算子，总耗时 **' + (op.total_time_us / 1000).toFixed(1) + ' ms**');
            if (op.top_ops && op.top_ops.length > 0) {
                const top3 = op.top_ops.slice(0, 3).map(o => '`' + o.type + '` (' + o.pct.toFixed(1) + '%)');
                summaryParts.push('Top 慢算子: ' + top3.join(', '));
            }
        }

        if (report.step_trace && report.step_trace.length > 0) {
            const st = report.step_trace[0];
            summaryParts.push('平均迭代时间 **' + (st.mean_step_time_us / 1000).toFixed(1) + ' ms**（' + st.step_count + ' 个 step）');
            if (st.overlap_analysis) {
                const r = st.overlap_analysis.overlap_ratio;
                const emoji = r >= 80 ? '良好' : (r >= 50 ? '一般' : '较差');
                summaryParts.push('计算-通信重叠率 **' + r.toFixed(1) + '%**（' + emoji + '）');
            }
        }

        if (report.communication && report.communication.length > 0) {
            summaryParts.push('通信操作 **' + report.communication[0].total_communications + '** 次');
        }

        if (report.multi_rank && report.multi_rank.rank_count > 1) {
            summaryParts.push(report.multi_rank.rank_count + ' 卡并行，最大偏差 **' + report.multi_rank.max_deviation_pct.toFixed(2) + '%**');
        }

        if (summaryParts.length > 0) {
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'chat-summary-card';
            const md = summaryParts.map(s => '- ' + s).join('\n');
            summaryDiv.innerHTML =
                '<div class="summary-title"><i data-lucide="sparkles" style="width:16px;height:16px;"></i> 报告摘要</div>' +
                '<div class="summary-body markdown-body">' + renderMarkdown(md) + '</div>';

            const welcomeMsg = messagesDiv.querySelector('.chat-msg-bot');
            if (welcomeMsg && welcomeMsg.nextSibling) {
                messagesDiv.insertBefore(summaryDiv, welcomeMsg.nextSibling);
            } else {
                messagesDiv.appendChild(summaryDiv);
            }

            if (window.lucide) lucide.createIcons();
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Multi-Group Repeated Structure Detection
    // Finds ALL distinct repeated structures (e.g., VAE + DiT in multimodal)
    // ═══════════════════════════════════════════════════════════════════════

    function _classifyStructure(opTypes) {
        const has = (kw) => opTypes.some(t => kw.some(k => t.includes(k)));
        const hasConv = has(['conv2d', 'conv3d']);
        const hasMatmul = has(['matmul', 'batchmatmul', 'gemm']);
        const hasSoftmax = has(['softmax']);
        const hasNorm = has(['layernorm', 'rmsnorm', 'groupnorm']);
        const hasAct = has(['gelu', 'silu', 'swish', 'fastgelu']);
        const hasAttn = has(['attention', 'flashattention']);

        if (hasConv && hasNorm && hasAct) return 'Diffusers (UNet/DiT Block)';
        if (hasConv && hasAct) return 'Diffusers (ResBlock)';
        if (hasConv && hasNorm) return 'Conv Block';
        if (hasMatmul && hasSoftmax) return 'Transformer (Attention + MLP)';
        if (hasMatmul && hasNorm && hasAct) return 'Transformer (with Norm)';
        if (hasMatmul && hasNorm) return 'Transformer-like';
        if (hasAttn) return 'Attention Block';
        if (hasMatmul && hasAct) return 'MLP/FFN';
        if (hasConv) return 'Conv Block';
        return 'Repeated Block';
    }

    /**
     * Detect all repeated structures in profiling data.
     * Returns an array of groups, each with {layerCount, structure, matchingOps, opNames, totalTimeMs, totalPct}.
     * Strategy: group ops by their exact count value, then classify each group.
     */
    function detectAllRepeatedLayers(topOps) {
        if (!topOps || topOps.length < 3) return [];

        // Group ops by their exact count (each distinct count = potential layer structure)
        const byCount = {};
        topOps.forEach(o => {
            if (o.count < 2) return;
            if (!byCount[o.count]) byCount[o.count] = [];
            byCount[o.count].push(o);
        });

        const groups = [];

        // For each count with ≥2 ops, create a group
        for (const [countStr, ops] of Object.entries(byCount)) {
            if (ops.length < 2) continue;
            const lc = parseInt(countStr);

            const opTypes = ops.map(o => o.type.toLowerCase());
            const structure = _classifyStructure(opTypes);
            const totalTimeMs = ops.reduce((s, o) => s + o.total_us, 0) / 1000;
            const totalPct = ops.reduce((s, o) => s + o.pct, 0);

            groups.push({
                layerCount: lc,
                structure,
                matchingOps: ops.length,
                opNames: ops.slice(0, 8).map(o => o.type),
                ops: ops,
                totalTimeMs,
                totalPct,
            });
        }

        // Sort by total time descending (most impactful first)
        groups.sort((a, b) => b.totalTimeMs - a.totalTimeMs);
        return groups;
    }

    // Backward compat: returns first group or null
    function detectRepeatedLayers(topOps) {
        const groups = detectAllRepeatedLayers(topOps);
        return groups.length > 0 ? groups[0] : null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Section AI Insights — detailed pre-generated analysis for each module
    // ═══════════════════════════════════════════════════════════════════════
    function generateSectionInsights() {
        const report = window.__REPORT__;
        if (!report) return;

        const insights = {};
        // Use backend-detected repeated structures (from kernel_details.csv sequence analysis)
        const repeatedStructures = report.repeated_structures || [];
        // Fallback: client-side detection from top_ops counts (less accurate)
        const allLayerGroups = repeatedStructures.length === 0
            ? ((report.op_analysis && report.op_analysis.length > 0)
                ? detectAllRepeatedLayers(report.op_analysis[0].top_ops) : [])
            : [];
        const layerInfo = allLayerGroups.length > 0 ? allLayerGroups[0] : null;

        // ─── 1. 概览 ───
        if (report.op_analysis && report.op_analysis.length > 0) {
            const op = report.op_analysis[0];
            const totalMs = (op.total_time_us / 1000).toFixed(1);
            let lines = [];
            lines.push('### 模型概况\n');
            lines.push('该模型共包含 **' + op.total_ops + '** 个算子，设备侧总耗时 **' + totalMs + ' ms**。');

            if (op.cube_vector) {
                const cv = op.cube_vector;
                if (cv.cube && cv.vector) {
                    const cubeP = cv.cube.pct.toFixed(1);
                    const vecP = cv.vector.pct.toFixed(1);
                    lines.push('\n**核心利用率**: Cube (矩阵计算) 占 **' + cubeP + '%**，Vector (向量计算) 占 **' + vecP + '%**。');
                    if (parseFloat(vecP) > 40) {
                        lines.push('\n> **注意**: Vector 算子占比超过 40%，这意味着大量时间花在非矩阵运算上。常见于 LayerNorm、激活函数、元素级操作等。优化方向：\n> - 算子融合 (operator fusion)：将连续的小 Vector 算子合并\n> - 使用 Flash Attention 减少中间 Softmax 等 Vector 操作\n> - 检查是否有不必要的类型转换 (Cast) 算子');
                    }
                    if (cv.aicpu && cv.aicpu.pct > 2) {
                        lines.push('\n> **警告**: AI_CPU 占比 **' + cv.aicpu.pct.toFixed(1) + '%**。AI_CPU 在 host 侧执行，效率远低于 NPU 核心，是常见的性能瓶颈。排查是否有可下沉到 NPU 的算子（如 IndexPut、Unique 等）。');
                    }
                }
            }

            if (report.step_trace && report.step_trace.length > 0) {
                const st = report.step_trace[0];
                lines.push('\n**迭代性能**: 平均迭代时间 **' + (st.mean_step_time_us / 1000).toFixed(1) + ' ms**（' + st.step_count + ' 个 step）。');
            }

            // ── Show repeated structures (backend-detected from op sequence) ──
            if (repeatedStructures.length > 0) {
                const totalUs = report.op_analysis[0].total_time_us || 1;
                lines.push('\n### 模型结构识别\n');
                lines.push('通过算子序列分析，检测到 **' + repeatedStructures.length + ' 组**重复结构：\n');
                lines.push('| # | 结构类型 | 重复层数 | 算子数/层 | 单层耗时 | 总耗时 | 一致性 |');
                lines.push('|---|---------|---------|----------|---------|--------|--------|');
                repeatedStructures.forEach((s, i) => {
                    lines.push('| ' + (i + 1) + ' | **' + s.name + '** | ' + s.layer_count + ' 层 | ' + s.ops_per_layer + ' | ' + (s.single_layer_time_us / 1000).toFixed(1) + 'ms | ' + (s.total_time_us / 1000).toFixed(1) + 'ms | ' + s.match_pct + '% |');
                });
                lines.push('');

                // For each structure, show the per-layer op list
                repeatedStructures.forEach((s, i) => {
                    lines.push('\n#### 结构 ' + (i + 1) + ' — ' + s.name + ' (' + s.layer_count + ' 层 × ' + s.ops_per_layer + ' ops)\n');
                    lines.push('> 优化此结构中任一瓶颈算子可放大 **' + s.layer_count + 'x** 收益（总耗时 ' + (s.total_time_us / 1000).toFixed(1) + 'ms）。\n');

                    // Show ALL ops in the single layer with details
                    lines.push('<details><summary>展开单层算子列表（' + s.ops_per_layer + ' 个算子）</summary>\n');
                    lines.push('| # | 算子类型 | 耗时(us) | 占比 | 加速核心 | 算子名称 |');
                    lines.push('|---|---------|---------|------|---------|---------|');
                    const layerTotal = s.single_layer_time_us || 1;
                    s.layer_ops.forEach(op => {
                        const pct = (op.duration_us / layerTotal * 100).toFixed(1);
                        const shortName = op.name.length > 50 ? op.name.substring(0, 47) + '...' : op.name;
                        lines.push('| ' + op.idx + ' | `' + op.type + '` | ' + op.duration_us.toFixed(1) + ' | ' + pct + '% | ' + (op.accelerator || '-') + ' | ' + shortName + ' |');
                    });
                    lines.push('\n</details>\n');

                    // Highlight top-5 time-consuming ops in this layer
                    const topOps = [...s.layer_ops].sort((a, b) => b.duration_us - a.duration_us).slice(0, 5);
                    lines.push('**单层 Top-5 耗时算子**: ' + topOps.map(o => '`' + o.type + '`(' + o.duration_us.toFixed(0) + 'us, ' + (o.duration_us / layerTotal * 100).toFixed(1) + '%)').join(', '));
                });
            } else if (allLayerGroups.length > 0) {
                // Fallback: client-side detection from counts
                lines.push('\n### 模型结构识别\n');
                lines.push('检测到 **' + allLayerGroups.length + ' 组**重复结构：\n');
                lines.push('| # | 结构类型 | 重复层数 | 算子组数 | 耗时 | 占比 |');
                lines.push('|---|---------|---------|---------|------|------|');
                allLayerGroups.forEach((g, i) => {
                    lines.push('| ' + (i + 1) + ' | **' + g.structure + '** | ' + g.layerCount + ' 层 | ' + g.matchingOps + ' 组 | ' + g.totalTimeMs.toFixed(1) + ' ms | ' + g.totalPct.toFixed(1) + '% |');
                });
            }

            insights.overview = lines.join('\n');
        }

        // ─── 2. 迭代时间分解 ───
        if (report.step_trace && report.step_trace.length > 0) {
            const st = report.step_trace[0];
            const bd = st.breakdown;
            let lines = ['### 时间分解诊断\n'];
            if (bd) {
                const entries = Object.entries(bd).sort((a, b) => b[1].pct - a[1].pct);
                const top = entries[0];
                lines.push('迭代时间主要由 **' + top[0] + '** 占据（**' + top[1].pct.toFixed(1) + '%**）。\n');

                // Detailed breakdown
                lines.push('| 阶段 | 占比 | 诊断 |');
                lines.push('|------|------|------|');
                for (const [field, info] of entries) {
                    if (info.pct < 0.5) continue;
                    let diag = '正常';
                    if (field === 'Computing' && info.pct < 60) diag = '偏低，非计算开销过大';
                    else if (field === 'Computing' && info.pct > 85) diag = '良好，计算密集';
                    else if (field === 'Computing') diag = '正常';
                    else if (field.includes('Commun') && info.pct > 20) diag = '**偏高**，通信瓶颈';
                    else if (field.includes('Commun') && info.pct > 10) diag = '中等，有优化空间';
                    else if (field === 'Free' && info.pct > 10) diag = '**偏高**，设备空闲';
                    else if (field === 'Free' && info.pct > 5) diag = '有优化空间';
                    else if (field === 'Overlapped') diag = '通信被计算掩盖';
                    lines.push('| ' + field + ' | ' + info.pct.toFixed(1) + '% | ' + diag + ' |');
                }

                const freeEntry = entries.find(e => e[0] === 'Free');
                if (freeEntry && freeEntry[1].pct > 10) {
                    lines.push('\n**Free 时间诊断**: 设备空闲 **' + freeEntry[1].pct.toFixed(1) + '%** 时间。可能原因：\n- Host 侧算子下发速度不足（Python GIL / CPU 瓶颈）\n- DataLoader 数据加载慢（IO 瓶颈）\n- 梯度同步等待（多卡场景下的负载不均）\n\n建议：1) 检查 `算子下发速率` 模块是否有瓶颈窗口；2) 使用 `num_workers > 0` 的异步数据加载；3) 开启 `prefetch_factor` 预取。');
                }
                const commEntry = entries.find(e => e[0].includes('Commun'));
                if (commEntry && commEntry[1].pct > 15) {
                    lines.push('\n**通信时间诊断**: 未掩盖通信占 **' + commEntry[1].pct.toFixed(1) + '%**。优化建议：\n- 开启梯度桶通信 (gradient bucketing)，与反向计算流水线执行\n- 增大通信粒度以提升带宽利用率\n- 检查 `计算-通信重叠分析` 模块的重叠率');
                }
            }
            insights['step-trace'] = lines.join('\n');
        }

        // ─── 3. 重叠分析 ───
        if (report.step_trace && report.step_trace.length > 0 && report.step_trace[0].overlap_analysis) {
            const oa = report.step_trace[0].overlap_analysis;
            let lines = ['### 计算-通信重叠诊断\n'];
            lines.push('| 指标 | 值 |');
            lines.push('|------|-----|');
            lines.push('| 重叠率 | **' + oa.overlap_ratio.toFixed(1) + '%** |');
            lines.push('| 目标 | ≥ ' + oa.target + '% |');
            lines.push('| 已掩盖通信 | ' + (oa.overlapped_us / 1000).toFixed(1) + ' ms |');
            lines.push('| 未掩盖通信 | ' + (oa.not_overlapped_us / 1000).toFixed(1) + ' ms |');

            if (oa.overlap_ratio >= 80) {
                lines.push('\n**状态**: 重叠效果良好。通信时间基本被计算隐藏，流水线效率高。');
            } else if (oa.overlap_ratio >= 50) {
                lines.push('\n**状态**: 重叠效果一般。仍有 **' + (oa.not_overlapped_us / 1000).toFixed(1) + ' ms** 通信暴露。');
                lines.push('\n**优化建议**:\n1. 调整梯度通信桶大小 (bucket size)，使通信与计算更好对齐\n2. 确认 DDP 使用了 `find_unused_parameters=False`\n3. 检查是否有大块通信阻塞了计算流水线');
            } else {
                lines.push('\n**状态**: **重叠率严重偏低**，大量通信时间暴露在计算外，是主要性能瓶颈。');
                lines.push('\n**优化建议**:\n1. 启用梯度通信与反向计算的流水线并行（如 torch.distributed `overlap_grad_comm`）\n2. 拆分大通信操作为小粒度，与计算交替执行\n3. 考虑使用异步 AllReduce\n4. 如果是 TP (Tensor Parallel)，检查 AllReduce 是否可用 ReduceScatter + AllGather 替代');
            }

            if (oa.per_step && oa.per_step.length > 1) {
                const ratios = oa.per_step.map(s => s.ratio);
                const minR = Math.min(...ratios);
                const maxR = Math.max(...ratios);
                if (maxR - minR > 20) {
                    lines.push('\n> **波动警告**: 各 step 间重叠率波动较大（' + minR.toFixed(0) + '% ~ ' + maxR.toFixed(0) + '%），可能由动态 shape 或不规则通信模式导致。');
                }
            }
            insights.overlap = lines.join('\n');
        }

        // ─── 4. 算子分析（合并后的核心分布 + 数据类型 + 类型分解）───
        if (report.op_analysis && report.op_analysis.length > 0) {
            const op = report.op_analysis[0];
            let lines = ['### 算子综合分析\n'];

            // Core distribution
            if (op.cube_vector) {
                const cv = op.cube_vector;
                lines.push('**核心类型分布**:\n');
                lines.push('| 核心类型 | 耗时占比 | 说明 |');
                lines.push('|---------|---------|------|');
                if (cv.cube) lines.push('| AI_CORE (Cube) | **' + cv.cube.pct.toFixed(1) + '%** | 矩阵计算，MatMul/Conv 等 |');
                if (cv.vector) lines.push('| AI_VECTOR | **' + cv.vector.pct.toFixed(1) + '%** | 向量计算，Activation/Norm/Eltwise |');
                if (cv.mix) lines.push('| MIX | **' + cv.mix.pct.toFixed(1) + '%** | 混合 Cube+Vector |');
                if (cv.aicpu) lines.push('| AI_CPU | **' + cv.aicpu.pct.toFixed(1) + '%** | Host 侧执行，效率最低 |');

                if (cv.cube && cv.vector) {
                    const ratio = (cv.cube.pct / (cv.cube.pct + cv.vector.pct) * 100).toFixed(0);
                    lines.push('\nCube 计算效率占比 **' + ratio + '%**。');
                    if (parseInt(ratio) < 50) {
                        lines.push('Cube 利用率偏低，模型中大量时间花在非矩阵运算。\n\n**可能原因**: \n- 小算子过多（如逐元素 Add、Mul 等）\n- 过多的数据格式转换 (TransData)\n- 激活函数和 Norm 操作占比大\n\n**优化方向**: 算子融合、使用 FlashAttention、AOT 编译优化。');
                    }
                }
            }

            // Dtype analysis
            if (op.dtype_analysis) {
                const da = op.dtype_analysis;
                lines.push('\n**数据类型分析**:\n');
                if (da.by_time && da.by_time.length > 0) {
                    lines.push('| 数据类型 | 耗时占比 | 算子数占比 |');
                    lines.push('|---------|---------|----------|');
                    const byCount = da.by_count || [];
                    for (const dt of da.by_time.slice(0, 5)) {
                        const countInfo = byCount.find(c => c.dtype === dt.dtype);
                        const cntPct = countInfo ? countInfo.pct.toFixed(1) + '%' : '-';
                        lines.push('| ' + dt.dtype.replace('DT_', '') + ' | **' + dt.pct.toFixed(1) + '%** | ' + cntPct + ' |');
                    }

                    // Check for FP32 usage that could be FP16
                    const fp32 = da.by_time.find(d => d.dtype.includes('FLOAT') && !d.dtype.includes('16'));
                    const fp16 = da.by_time.find(d => d.dtype.includes('FLOAT16') || d.dtype.includes('BF16'));
                    if (fp32 && fp32.pct > 30 && (!fp16 || fp16.pct < fp32.pct)) {
                        lines.push('\n> **优化机会**: FP32 算子占比 **' + fp32.pct.toFixed(1) + '%**，建议检查是否可启用混合精度 (AMP) 将部分计算转为 FP16/BF16，可显著提升吞吐。');
                    }
                }
                if (da.type_conversions && da.type_conversions.length > 0) {
                    const totalConv = da.type_conversions.reduce((s, c) => s + c.time_us, 0);
                    lines.push('\n检测到 **' + da.type_conversions.length + '** 种类型转换算子，共耗时 **' + (totalConv / 1000).toFixed(2) + ' ms**。频繁的 Cast 操作增加额外开销，建议在模型中统一输入/输出数据类型。');
                }
            }

            // Type breakdown
            if (op.type_breakdown && op.type_breakdown.length > 0) {
                const tb = op.type_breakdown;
                lines.push('\n**Top 算子类型**:\n');
                const cumTop5 = tb.slice(0, 5).reduce((s, t) => s + t.pct, 0);
                lines.push('| # | OP Type | 占比 | 累计 | 优化建议 |');
                lines.push('|---|---------|------|------|---------|');
                let cum = 0;
                for (let i = 0; i < Math.min(5, tb.length); i++) {
                    cum += tb[i].pct;
                    let advice = '-';
                    const t = tb[i].type.toLowerCase();
                    if (t.includes('matmul') || t.includes('batchmatmul')) advice = '检查 shape 对齐 (32 的倍数)';
                    else if (t.includes('softmax')) advice = '考虑 FlashAttention';
                    else if (t.includes('layernorm') || t.includes('rmsnorm')) advice = '算子融合';
                    else if (t.includes('transdata')) advice = '减少格式转换';
                    else if (t.includes('cast')) advice = '使用统一精度';
                    else if (t.includes('add') && tb[i].pct > 5) advice = '残差连接融合';
                    lines.push('| ' + (i + 1) + ' | `' + tb[i].type + '` | ' + tb[i].pct.toFixed(1) + '% | ' + cum.toFixed(1) + '% | ' + advice + ' |');
                }
                if (cumTop5 > 70) {
                    lines.push('\n前 5 类算子累计占 **' + cumTop5.toFixed(1) + '%**，优化集中度高，针对性优化收益显著。');
                }
            }

            insights['op-analysis'] = lines.join('\n');
        }

        // ─── 5. Top 慢算子组 ───
        if (report.op_analysis && report.op_analysis.length > 0 && report.op_analysis[0].top_ops) {
            const op = report.op_analysis[0];
            const ops = op.top_ops;
            let lines = ['### 慢算子深度分析\n'];
            if (ops.length > 0) {
                // Top 3 详解
                const top3 = ops.slice(0, 3);
                for (let i = 0; i < top3.length; i++) {
                    const o = top3[i];
                    lines.push('**#' + (i + 1) + ' `' + o.type + '`** (' + o.category + ')');
                    lines.push('- 执行次数: **' + o.count + '** 次，总耗时 **' + (o.total_us / 1000).toFixed(1) + ' ms** (' + o.pct.toFixed(1) + '%)');
                    lines.push('- 均值: ' + o.mean_us.toFixed(1) + ' us, CV: ' + (o.cv * 100).toFixed(2) + '%, Bound: ' + (o.bound || 'unknown'));
                    if (o.dtype) lines.push('- Dtype: `' + o.dtype.replace('DT_', '') + '`, Format: `' + (o.format || '-') + '`');
                    if (o.shapes) lines.push('- Shapes: `' + o.shapes + '`');

                    // Estimated throughput for MatMul ops
                    const tLowerPre = o.type.toLowerCase();
                    if ((tLowerPre.includes('matmul') || tLowerPre.includes('batchmatmul')) && o.shapes) {
                        try {
                            // Try to parse shapes like "[2,512,512]x[2,512,512]" or "[M,K]x[K,N]"
                            const parts = o.shapes.split(/[;x×]/);
                            if (parts.length >= 2) {
                                const dims1 = parts[0].replace(/[\[\]\s]/g, '').split(',').map(Number).filter(n => !isNaN(n));
                                const dims2 = parts[1].replace(/[\[\]\s]/g, '').split(',').map(Number).filter(n => !isNaN(n));
                                if (dims1.length >= 2 && dims2.length >= 2) {
                                    const M = dims1[dims1.length - 2];
                                    const K = dims1[dims1.length - 1];
                                    const N = dims2[dims2.length - 1];
                                    const batch = dims1.length > 2 ? dims1.slice(0, -2).reduce((a, b) => a * b, 1) : 1;
                                    const flops = 2 * batch * M * N * K;  // 2*M*N*K for MatMul
                                    const tflops = flops / (o.mean_us * 1e6);  // TFLOPS
                                    const bytesPerElem = (o.dtype && (o.dtype.includes('16') || o.dtype.includes('BF16'))) ? 2 : 4;
                                    const dataBytes = (batch * M * K + batch * K * N + batch * M * N) * bytesPerElem;
                                    const arithmeticIntensity = flops / dataBytes;
                                    lines.push('- **估算**: ' + (batch > 1 ? 'Batch=' + batch + ', ' : '') + 'M=' + M + ', K=' + K + ', N=' + N + ' → **' + tflops.toFixed(2) + ' TFLOPS** (AI=' + arithmeticIntensity.toFixed(0) + ')');
                                    // Ascend 910B FP16 peak ~320 TFLOPS
                                    if (tflops < 10) {
                                        lines.push('  > 吞吐偏低，可能因 shape 较小未充分利用 Cube 核心。');
                                    }
                                }
                            }
                        } catch(e) { /* skip if shape parsing fails */ }
                    }

                    // Pipeline utilization cross-reference
                    if (op.pipeline_utilization && op.pipeline_utilization.top_ops) {
                        const pipeOp = op.pipeline_utilization.top_ops.find(p => p.type === o.type);
                        if (pipeOp) {
                            const mac = ((pipeOp.mac_ratio || 0) * 100).toFixed(0);
                            const vec = ((pipeOp.vec_ratio || 0) * 100).toFixed(0);
                            const mte2 = ((pipeOp.mte2_ratio || 0) * 100).toFixed(0);
                            lines.push('- 流水线利用率: Mac=' + mac + '%, Vec=' + vec + '%, MTE2=' + mte2 + '%');
                            const maxUtil = Math.max(pipeOp.mac_ratio || 0, pipeOp.vec_ratio || 0);
                            if (maxUtil < 0.5) {
                                lines.push('  > **利用率偏低** (' + (maxUtil * 100).toFixed(0) + '%)，计算单元未被充分利用。可能原因：shape 未对齐 32 的倍数、数据搬运瓶颈 (MTE2=' + mte2 + '% 偏高)。');
                            }
                        }
                    }

                    // Optimization advice based on op type
                    const tLower = o.type.toLowerCase();
                    if (tLower.includes('matmul') || tLower.includes('batchmatmul')) {
                        lines.push('- **优化建议**: 确保 M/N/K 维度为 16 或 32 的倍数以利用 Cube 核心的最大吞吐。检查是否可使用 BF16 混合精度。');
                    } else if (tLower.includes('softmax')) {
                        lines.push('- **优化建议**: 使用 FlashAttention 将 Softmax 融合进 Attention 计算，避免独立 Softmax 调用。');
                    } else if (tLower.includes('transdata') || tLower.includes('transpose')) {
                        lines.push('- **优化建议**: TransData 是数据格式转换开销。检查模型是否频繁在 NCHW/NHWC 之间切换，尝试统一内部格式。');
                    } else if (tLower.includes('layernorm') || tLower.includes('rmsnorm')) {
                        lines.push('- **优化建议**: LayerNorm/RMSNorm 是 Vector 密集算子。可通过算子融合（如将 Norm+Linear 融合）减少独立调用次数。');
                    } else if (tLower.includes('conv2d') || tLower.includes('conv3d')) {
                        lines.push('- **优化建议**: 卷积算子建议检查 input channel/output channel 是否对齐 NPU Cube 核心的最优分块大小（通常为 16 的倍数）。对 Diffusers 模型可考虑 channels_last 内存格式。');
                    } else if (tLower.includes('cast')) {
                        lines.push('- **优化建议**: Cast 算子执行数据类型转换。建议在模型中统一使用 BF16/FP16，减少不必要的精度转换开销。');
                    } else if (tLower.includes('add') && o.pct > 3) {
                        lines.push('- **优化建议**: Add 算子是残差连接开销。可通过 inplace add 或算子融合（将 Add 合并到前序算子）减少调用。');
                    } else if (tLower.includes('gelu') || tLower.includes('silu') || tLower.includes('fastgelu')) {
                        lines.push('- **优化建议**: 激活函数建议与前序 Linear/Conv 融合为 fused kernel，减少中间 tensor 的读写开销。');
                    }
                    if (o.cv > 0.05) {
                        lines.push('- **抖动警告**: CV ' + (o.cv * 100).toFixed(1) + '% > 5%，执行时间不稳定。' + (o.category === 'cube' ? '可能由 NPU 动态降频引起。' : ''));
                    }
                    lines.push('');
                }

                // Layer detection summary — backend-detected structures
                if (repeatedStructures.length > 0) {
                    lines.push('### 重复层模式\n');
                    if (repeatedStructures.length > 1) {
                        lines.push('检测到 **' + repeatedStructures.length + ' 组**不同的重复结构（如多模态模型中的 VAE + DiT）：\n');
                    }
                    for (let si = 0; si < repeatedStructures.length; si++) {
                        const s = repeatedStructures[si];
                        const layerTotal = s.single_layer_time_us || 1;
                        lines.push('**结构 ' + (si + 1) + ': ' + s.name + '** (' + s.layer_count + ' 层 × ' + s.ops_per_layer + ' ops/层)\n');
                        lines.push('| 指标 | 值 |');
                        lines.push('|------|-----|');
                        lines.push('| 重复层数 | **' + s.layer_count + '** |');
                        lines.push('| 单层算子数 | ' + s.ops_per_layer + ' |');
                        lines.push('| 单层耗时 | **' + (s.single_layer_time_us / 1000).toFixed(2) + ' ms** |');
                        lines.push('| 总耗时 | **' + (s.total_time_us / 1000).toFixed(1) + ' ms** |');
                        lines.push('| 结构一致性 | ' + s.match_pct + '% |');

                        // Top-5 ops per layer
                        const topLayerOps = [...s.layer_ops].sort((a, b) => b.duration_us - a.duration_us).slice(0, 5);
                        lines.push('\n**单层 Top-5 耗时算子**:\n');
                        lines.push('| # | 算子类型 | 耗时(us) | 层内占比 | 加速核心 |');
                        lines.push('|---|---------|---------|---------|---------|');
                        topLayerOps.forEach((op, j) => {
                            const pct = (op.duration_us / layerTotal * 100).toFixed(1);
                            lines.push('| ' + (j + 1) + ' | `' + op.type + '` | ' + op.duration_us.toFixed(1) + ' | ' + pct + '% | ' + (op.accelerator || '-') + ' |');
                        });

                        lines.push('\n> 优化此结构中任一算子可获得 **' + s.layer_count + 'x** 收益放大。\n');
                    }
                } else if (allLayerGroups.length > 0) {
                    // Fallback: count-based detection
                    lines.push('### 重复层模式\n');
                    for (let gi = 0; gi < allLayerGroups.length; gi++) {
                        const g = allLayerGroups[gi];
                        lines.push('**结构 ' + (gi + 1) + ': ' + g.structure + '** (' + g.layerCount + ' 层)\n');
                        lines.push('算子组: `' + g.opNames.join('`, `') + '`\n');
                        lines.push('> 优化此结构中任一算子可获得 **' + g.layerCount + 'x** 收益放大。\n');
                    }
                }

                // Pipeline utilization summary table (with dtype & shape)
                if (op.pipeline_utilization && op.pipeline_utilization.top_ops && op.pipeline_utilization.top_ops.length > 0) {
                    const pipeOps = op.pipeline_utilization.top_ops;
                    lines.push('### 流水线利用率汇总\n');
                    lines.push('| OP Type | Dtype | Shape | Mac% | Vec% | MTE2% | 瓶颈 | 诊断 |');
                    lines.push('|---------|-------|-------|------|------|-------|------|------|');
                    for (const po of pipeOps.slice(0, 8)) {
                        const mac = ((po.mac_ratio || 0) * 100).toFixed(0);
                        const vec = ((po.vec_ratio || 0) * 100).toFixed(0);
                        const mte2 = ((po.mte2_ratio || 0) * 100).toFixed(0);
                        const dtype = (po.dtype || '-').replace('DT_', '');
                        const shapes = (po.shapes || '-').substring(0, 25);
                        const maxUnit = po.mac_ratio >= po.vec_ratio && po.mac_ratio >= (po.mte2_ratio || 0)
                            ? 'Mac' : (po.vec_ratio >= (po.mte2_ratio || 0) ? 'Vec' : 'MTE2');
                        const maxVal = Math.max(po.mac_ratio || 0, po.vec_ratio || 0, po.mte2_ratio || 0);
                        let diag = '正常';
                        if (maxVal < 0.3) diag = '**严重偏低**';
                        else if (maxVal < 0.5) diag = '偏低';
                        else if ((po.mte2_ratio || 0) > 0.5 && (po.mte2_ratio || 0) > Math.max(po.mac_ratio || 0, po.vec_ratio || 0)) diag = '搬运瓶颈';
                        lines.push('| `' + po.type.substring(0, 18) + '` | ' + dtype + ' | `' + shapes + '` | ' + mac + ' | ' + vec + ' | ' + mte2 + ' | ' + maxUnit + ' | ' + diag + ' |');
                    }
                    lines.push('');
                }

                // Overall stats
                const jitterOps = ops.filter(o => o.cv > 0.05);
                const computeBound = ops.filter(o => o.bound === 'compute').length;
                const memBound = ops.filter(o => o.bound === 'memory').length;
                lines.push('### 整体统计\n');
                lines.push('- Bound 分布: 计算瓶颈 **' + computeBound + '** 个, 带宽瓶颈 **' + memBound + '** 个');
                if (jitterOps.length > 0) lines.push('- 抖动算子: **' + jitterOps.length + '** 个 (CV > 5%)');
                if (ops.length >= 3) {
                    const top3Pct = ops.slice(0, 3).reduce((s, o) => s + o.pct, 0);
                    lines.push('- Top 3 算子累计占比: **' + top3Pct.toFixed(1) + '%**');
                }
            }
            insights['top-ops'] = lines.join('\n');
        }

        // ─── 6. 流水线利用率 ───
        if (report.op_analysis && report.op_analysis.length > 0 && report.op_analysis[0].pipeline_utilization) {
            const pu = report.op_analysis[0].pipeline_utilization;
            if (pu.top_ops && pu.top_ops.length > 0) {
                let lines = ['### 流水线利用率诊断\n'];
                lines.push('NPU 的 Cube/Vector/MTE 单元并行流水线执行，理想情况下各单元利用率应接近 100%。\n');

                const lowMac = pu.top_ops.filter(o => o.mac_ratio !== undefined && o.mac_ratio < 0.5);
                const lowVec = pu.top_ops.filter(o => o.vec_ratio !== undefined && o.vec_ratio < 0.5);
                const highMte2 = pu.top_ops.filter(o => o.mte2_ratio !== undefined && o.mte2_ratio > 0.5);

                lines.push('| 问题类型 | 数量 | 说明 |');
                lines.push('|---------|------|------|');
                lines.push('| Mac < 50% | **' + lowMac.length + '/' + pu.top_ops.length + '** | Cube 核心未充分利用 |');
                lines.push('| Vec < 50% | **' + lowVec.length + '/' + pu.top_ops.length + '** | Vector 核心未充分利用 |');
                lines.push('| MTE2 > 50% | **' + highMte2.length + '/' + pu.top_ops.length + '** | 数据搬运占比高 |');

                if (highMte2.length > 0) {
                    lines.push('\n**MTE2 瓶颈算子**: ' + highMte2.slice(0, 3).map(o => '`' + o.type + '`').join(', '));
                    lines.push('这些算子的大部分时间花在数据搬运上，说明计算强度不足或内存访问模式不够友好。优化方向: shape 对齐、数据重排、算子融合。');
                }
                if (lowMac.length > pu.top_ops.length / 2) {
                    lines.push('\n> 超过一半算子的 Mac 利用率不足 50%，整体 Cube 利用率偏低。建议检查矩阵维度是否对齐 NPU 的最优 tile 大小。');
                }
                insights.pipeline = lines.join('\n');
            }
        }

        // ─── 7. 抖动分析 ───
        if (report.op_analysis && report.op_analysis.length > 0 && report.op_analysis[0].jitter) {
            const jitter = report.op_analysis[0].jitter;
            if (jitter.length > 0) {
                let lines = ['### 算子执行抖动诊断\n'];
                lines.push('检测到 **' + jitter.length + '** 个算子组存在执行时间抖动（CV > 5%）。\n');

                const worst3 = jitter.slice(0, 3);
                lines.push('| 算子 | 核心 | CV | 均值 | 最大/最小比 | 诊断 |');
                lines.push('|------|------|-----|------|-----------|------|');
                for (const j of worst3) {
                    const ratio = j.max_us > 0 && j.min_us > 0 ? (j.max_us / j.min_us).toFixed(1) + 'x' : '-';
                    let diag = '未知';
                    if (j.category === 'cube' || j.category === 'mix') diag = 'NPU 降频 / 热管理';
                    else if (j.cv > 0.2) diag = '严重抖动，排查调度';
                    else diag = '轻度抖动';
                    lines.push('| `' + j.type + '` | ' + j.category + ' | **' + (j.cv * 100).toFixed(1) + '%** | ' + j.mean_us.toFixed(0) + 'us | ' + ratio + ' | ' + diag + ' |');
                }

                const cubeJitter = jitter.filter(j => j.category === 'cube' || j.category === 'mix');
                if (cubeJitter.length > 0) {
                    lines.push('\n**Cube/Mix 算子抖动** (' + cubeJitter.length + ' 个): 可能由 NPU 动态降频（功耗/温度管理）或 L2 cache 竞争引起。排查步骤：\n1. 检查 `npu-smi` 温度和功耗是否接近阈值\n2. 尝试固定 NPU 频率: `npu-smi set -t 0 -i 0 -f max`\n3. 排除多进程 NPU 共享导致的 cache 竞争');
                }
                insights.jitter = lines.join('\n');
            }
        }

        // ─── 8. 通信分析（合并后的通信统计 + Shape 分组）───
        if (report.communication && report.communication.length > 0) {
            const cm = report.communication[0];
            let lines = ['### 通信综合分析\n'];
            lines.push('总通信操作 **' + cm.total_communications + '** 次。\n');

            if (cm.by_type && cm.by_type.length > 0) {
                lines.push('| 通信类型 | 次数 | 耗时 | 占比 | 带宽 | 评估 |');
                lines.push('|---------|------|------|------|------|------|');
                for (const tp of cm.by_type) {
                    let eval_ = '正常';
                    if (tp.bandwidth_gbps < 5 && tp.pct > 10) eval_ = '**带宽低**';
                    else if (tp.bandwidth_gbps > 200) eval_ = '良好';
                    else if (tp.bandwidth_gbps > 50) eval_ = '正常';
                    else if (tp.pct > 30) eval_ = '占比高';
                    lines.push('| `' + tp.type + '` | ' + tp.count + ' | ' + (tp.time_us / 1000).toFixed(1) + 'ms | ' + tp.pct.toFixed(1) + '% | ' + tp.bandwidth_gbps.toFixed(1) + ' GB/s | ' + eval_ + ' |');
                }

                const topComm = cm.by_type[0];
                if (topComm.bandwidth_gbps < 10 && topComm.pct > 20) {
                    lines.push('\n> **警告**: `' + topComm.type + '` 带宽仅 ' + topComm.bandwidth_gbps.toFixed(1) + ' GB/s，远低于 HCCS 理论峰值。可能原因：\n> - 通信数据量过小（小包通信效率低）\n> - 网络拥塞或 HCCL 配置不当\n> - 建议增大通信粒度，合并小通信操作');
                }
            }

            // Shape groups
            if (report.comm_shape_analysis && report.comm_shape_analysis.length > 0) {
                const cs = report.comm_shape_analysis[0];
                if (cs.shape_groups && cs.shape_groups.length > 0) {
                    const jitterGroups = cs.shape_groups.filter(g => g.cv > 0.05);
                    lines.push('\n**通信 Shape 分组**: 共 **' + cs.shape_groups.length + '** 个分组。');
                    if (jitterGroups.length > 0) {
                        lines.push('其中 **' + jitterGroups.length + '** 个 CV > 5%，存在通信时间波动：');
                        for (const g of jitterGroups.slice(0, 3)) {
                            lines.push('- `' + g.name + '` (shape: `' + g.shapes + '`): CV=' + (g.cv * 100).toFixed(1) + '%, 范围 ' + g.min_us.toFixed(0) + '~' + g.max_us.toFixed(0) + ' us');
                        }
                        lines.push('\n通信抖动可能由网络竞争、RDMA 重传或不均匀的数据分布引起。');
                    }
                }
            }
            insights.comm = lines.join('\n');
        }

        // ─── 9. 多卡快慢卡分析（按 SKILL.md 原则2：看 Comm占比差异）───
        if (report.multi_rank && report.multi_rank.rank_count > 1) {
            const mr = report.multi_rank;
            let lines = ['### 多卡负载均衡诊断\n'];
            lines.push(mr.rank_count + ' 卡并行，平均迭代时间 **' + (mr.mean_total_us / 1000).toFixed(1) + ' ms**，最大总时间偏差 ' + mr.max_deviation_pct.toFixed(2) + '%。\n');

            if (mr.ranks && mr.ranks.length > 0) {
                // Per-rank detail table with Comm占比 as primary indicator
                lines.push('| Device | 总时间 | 计算 | Comp占比 | 通信(未掩盖) | Comm占比 | Free | 标记 |');
                lines.push('|--------|--------|------|---------|------------|---------|------|------|');

                const bottleneckSet = new Set(mr.bottleneck_ranks || []);
                const slowSet = new Set(mr.slow_ranks || []);
                const fastSet = new Set(mr.fast_ranks || []);

                for (const r of mr.ranks) {
                    const tags = [];
                    if (bottleneckSet.has(r.device_id)) tags.push('**计算瓶颈**');
                    if (slowSet.has(r.device_id)) tags.push('**等待卡**');
                    if (fastSet.has(r.device_id) && !bottleneckSet.has(r.device_id)) tags.push('快卡');
                    const mark = tags.length > 0 ? tags.join(' ') : '-';

                    lines.push('| Device ' + r.device_id +
                        ' | ' + ((r.total_us || 0) / 1000).toFixed(1) + 'ms' +
                        ' | ' + ((r.computing_us || 0) / 1000).toFixed(1) + 'ms' +
                        ' | ' + (r.comp_pct || 0).toFixed(1) + '%' +
                        ' | ' + ((r.comm_us || 0) / 1000).toFixed(1) + 'ms' +
                        ' | ' + (r.comm_pct || 0).toFixed(1) + '%' +
                        ' | ' + ((r.free_us || 0) / 1000).toFixed(1) + 'ms' +
                        ' | ' + mark + ' |');
                }
            }

            // ── Fast/Slow card diagnosis ──
            if (mr.has_fast_slow) {
                const commRatio = mr.comm_pct_ratio || 0;
                lines.push('\n### 快慢卡诊断\n');
                lines.push('Comm 占比差异 **' + commRatio.toFixed(1) + ' 倍**（阈值 1.5 倍），存在明显快慢卡现象。\n');

                if (mr.root_cause && mr.root_cause.endsWith('_wait')) {
                    // Collective wait pattern: computing imbalance is the root cause
                    const bnRanks = mr.bottleneck_ranks || [];
                    const waitRanks = mr.slow_ranks || [];
                    // Derive readable collective name from root_cause (e.g. "alltoall_wait" → "AllToAll")
                    const _collectiveMap = {
                        'alltoall': 'AllToAll', 'allreduce': 'AllReduce', 'allgather': 'AllGather',
                        'reduce_scatter': 'ReduceScatter', 'broadcast': 'Broadcast',
                    };
                    const rawCollective = mr.dominant_collective || mr.root_cause.replace('_wait', '');
                    const collectiveName = _collectiveMap[rawCollective] || rawCollective;
                    lines.push('> **根因分析：' + collectiveName + ' 等待模式**\n>\n');
                    lines.push('> **计算瓶颈卡**: Device ' + bnRanks.join(', ') + '（计算时间最长，导致其他卡在 ' + collectiveName + ' 同步时等待）\n>\n');
                    lines.push('> **等待卡**: Device ' + waitRanks.join(', ') + '（计算快，但在 ' + collectiveName + ' 等待瓶颈卡，表现为 Comm 占比高）\n>\n');
                    lines.push('> 各卡总时间接近（偏差仅 ' + mr.max_deviation_pct.toFixed(2) + '%），是因为通信同步拉平了总时间差异。' +
                        '但 Comm 占比差异（' + commRatio.toFixed(1) + 'x）暴露了计算不均衡的本质。\n>\n');
                    lines.push('> **优化方向**（针对计算瓶颈卡 Device ' + bnRanks.join(', ') + '）:\n' +
                        '> 1. 检查数据分配是否均匀（各卡处理的 batch / token 数量是否一致）\n' +
                        '> 2. 检查是否存在动态 shape 导致部分卡计算量更大\n' +
                        '> 3. 检查 NPU 是否降频（`npu-smi info -t board` 查看频率和温度）\n' +
                        '> 4. 若为 tensor parallel / sequence parallel，检查切分是否导致计算不均\n' +
                        '> 5. 使用 `npu-smi info -t usages` 确认无其他进程抢占 NPU 资源');
                } else if (mr.root_cause === 'comm_imbalance') {
                    // Pure communication imbalance (not caused by computing diff)
                    const slowRanks = mr.slow_ranks || [];
                    lines.push('> **通信不均衡诊断**: 各卡通信耗时存在显著差异（' + commRatio.toFixed(1) + 'x）。\n>\n');
                    lines.push('> **慢卡** (Comm 占比高): Device ' + slowRanks.join(', ') + '\n>\n');
                    lines.push('> **可能原因**:\n' +
                        '> - HCCL 通信拓扑不对称（部分卡之间经过更多跳数）\n' +
                        '> - 梯度分桶大小不均匀\n' +
                        '> - 网络带宽不对等（检查 HCCS/RoCE 链路状态）\n>\n' +
                        '> **优化建议**:\n' +
                        '> 1. 检查 HCCL 拓扑配置 `hccl_world_group_rank_table`\n' +
                        '> 2. 使用 `hccl_test` 测试各卡对通信带宽\n' +
                        '> 3. 确认 HCCS 链路健康（`npu-smi info -t link-status`）');
                }
            } else if (mr.max_deviation_pct < 3) {
                const commPcts = mr.ranks.map(r => (r.comm_pct || 0));
                const maxComm = Math.max(...commPcts);
                const minComm = Math.min(...commPcts);
                const commDiff = minComm > 0 ? (maxComm / minComm) : 0;
                if (commDiff < 1.5) {
                    lines.push('\n各卡负载均衡良好：总时间偏差 < 3%，Comm 占比差异 < 1.5 倍。');
                }
            }

            // ── Phase imbalance detail table ──
            const imbalances = mr.phase_imbalances || [];
            if (imbalances.length > 0) {
                lines.push('\n### 各阶段时间分布\n');
                lines.push('| 阶段 | 平均 | 最小 | 最大 | 波动幅度 | 偏高 | 偏低 |');
                lines.push('|------|------|------|------|---------|------|------|');
                for (const imb of imbalances) {
                    const highStr = (imb.high_devices || imb.slow_devices || []).length > 0 ? 'Device ' + (imb.high_devices || imb.slow_devices).join(', ') : '-';
                    const lowStr = (imb.low_devices || imb.fast_devices || []).length > 0 ? 'Device ' + (imb.low_devices || imb.fast_devices).join(', ') : '-';
                    lines.push('| **' + imb.phase + '** | ' + (imb.mean_us / 1000).toFixed(1) + 'ms | ' + (imb.min_us / 1000).toFixed(1) + 'ms | ' + (imb.max_us / 1000).toFixed(1) + 'ms | **' + imb.spread_pct.toFixed(0) + '%** | ' + highStr + ' | ' + lowStr + ' |');
                }
            }

            insights['multi-rank'] = lines.join('\n');
        }

        // ─── 10. 下发速率 ───
        if (report.op_analysis && report.op_analysis.length > 0 && report.op_analysis[0].dispatch_rate) {
            const dr = report.op_analysis[0].dispatch_rate;
            let lines = ['### 算子下发速率诊断\n'];
            lines.push('平均下发速率 **' + dr.avg_rate_ops_per_s.toFixed(0) + ' ops/s**，共 **' + dr.total_ops + '** 个算子。\n');
            if (dr.bottleneck_windows && dr.bottleneck_windows.length > 0) {
                lines.push('检测到 **' + dr.bottleneck_windows.length + '** 个瓶颈窗口（下发速率显著低于平均值）。\n');
                lines.push('**可能原因**:\n- Host 侧 Python 执行慢（GIL 竞争、动态图开销）\n- 频繁的 host-device 同步操作（如 `.item()`, `.cpu()`）\n- DataLoader 加载瓶颈（IO 慢、预处理耗时）\n');
                lines.push('**优化建议**:\n1. 避免在训练循环中调用 `.item()` 或 `.cpu()`\n2. 使用 `torch.compile()` 或图模式减少 Python 开销\n3. 增加 DataLoader `num_workers` 和 `prefetch_factor`\n4. 使用异步数据拷贝 `non_blocking=True`');
            } else {
                lines.push('未检测到明显的下发瓶颈，host 侧算子下发流畅。');
            }
            insights.dispatch = lines.join('\n');
        }

        // ─── 11. 优化建议 ───
        const allSuggs = [];
        if (report.op_analysis) report.op_analysis.forEach(op => (op.suggestions || []).forEach(s => allSuggs.push(s)));
        if (report.step_trace) report.step_trace.forEach(st => (st.suggestions || []).forEach(s => allSuggs.push(s)));
        if (allSuggs.length > 0) {
            const highSuggs = allSuggs.filter(s => s.startsWith('[HIGH]'));
            const medSuggs = allSuggs.filter(s => s.startsWith('[MEDIUM]'));
            const lowSuggs = allSuggs.filter(s => s.startsWith('[LOW]'));
            let lines = ['### 优化建议总结\n'];
            lines.push('共生成 **' + allSuggs.length + '** 条优化建议：\n');
            lines.push('| 优先级 | 数量 | 建议 |');
            lines.push('|--------|------|------|');
            if (highSuggs.length > 0) lines.push('| **HIGH** | ' + highSuggs.length + ' | 优先处理，预期收益最大 |');
            if (medSuggs.length > 0) lines.push('| MEDIUM | ' + medSuggs.length + ' | 中等优先级 |');
            if (lowSuggs.length > 0) lines.push('| LOW | ' + lowSuggs.length + ' | 低优先级 |');
            if (highSuggs.length > 0) {
                lines.push('\n**高优先级建议**:');
                for (const s of highSuggs.slice(0, 5)) {
                    lines.push('- ' + s.replace('[HIGH] ', ''));
                }
            }
            insights.suggestions = lines.join('\n');
        }

        // ─── Render all insights into their placeholders ───
        Object.entries(insights).forEach(([key, text]) => {
            const el = document.querySelector('.ai-section-insight[data-section="' + key + '"]');
            if (!el) return;
            el.innerHTML =
                '<div class="insight-header"><i data-lucide="sparkles"></i> AI 分析</div>' +
                '<div class="insight-body markdown-body">' + renderMarkdown(text) + '</div>' +
                '<div class="insight-toggle"><button onclick="toggleInsight(this)">展开全部</button></div>';
            el.classList.add('visible');

            // Show toggle if content overflows 300px
            requestAnimationFrame(() => {
                const body = el.querySelector('.insight-body');
                const toggle = el.querySelector('.insight-toggle');
                if (body && toggle && body.scrollHeight > 310) {
                    toggle.classList.add('visible');
                } else if (body) {
                    body.classList.add('expanded');
                }
            });
        });

        if (window.lucide) lucide.createIcons();
    }

    window.clearChatHistory = function() {
        try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch(e) {}
        // Reset to welcome message
        messagesDiv.innerHTML = '';
        const welcome = document.createElement('div');
        welcome.className = 'chat-msg chat-msg-bot';
        welcome.innerHTML = '<div class="chat-msg-content">' +
            '你好！我可以帮你分析这份 profiling 数据中的性能问题。你可以：' +
            '<ul><li>询问报告中的任何指标</li>' +
            '<li>粘贴 Perfetto 截图提问</li>' +
            '<li>获取优化建议</li></ul>' +
            '点击右侧仪表盘各项标题的 <strong>「问 AI」</strong> 按钮可快速提问。</div>';
        messagesDiv.appendChild(welcome);
        triggerAutoSummary();
        setTimeout(() => saveChatSession(), 500);
    };

    window.toggleInsight = function(btn) {
        const card = btn.closest('.ai-section-insight');
        const body = card.querySelector('.insight-body');
        if (body.classList.contains('expanded')) {
            body.classList.remove('expanded');
            btn.textContent = '展开全部';
        } else {
            body.classList.add('expanded');
            btn.textContent = '收起';
        }
    };

    // ─── TOC Active State Tracking ───
    function setupTocTracking() {
        const dashContent = document.getElementById('dashboard-content');
        const tocItems = document.querySelectorAll('.toc-item');
        if (!dashContent || tocItems.length === 0) return;

        tocItems.forEach(item => {
            item.addEventListener('click', e => {
                e.preventDefault();
                const sectionId = item.getAttribute('data-section');
                const section = document.getElementById(sectionId);
                if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });

        dashContent.addEventListener('scroll', () => {
            const sections = dashContent.querySelectorAll('.report-section[id]');
            let activeId = null;
            for (const sec of sections) {
                const rect = sec.getBoundingClientRect();
                if (rect.top < 200) activeId = sec.id;
            }
            tocItems.forEach(item => {
                item.classList.toggle('active', item.getAttribute('data-section') === activeId);
            });
        });
    }

    // ─── Mark repeated layer ops in top-ops table (multi-group) ───
    const _groupColors = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444'];

    function markRepeatedLayerOps() {
        const report = window.__REPORT__;
        if (!report || !report.op_analysis || !report.op_analysis.length) return;

        // Prefer backend-detected structures (from kernel_details.csv sequence analysis)
        const structures = report.repeated_structures || [];
        // Fallback: client-side detection from top_ops counts (less accurate)
        const groups = structures.length > 0
            ? structures.map((s, i) => ({
                layerCount: s.layer_count,
                structure: s.name,
                matchingOps: s.ops_per_layer,
                opTypes: new Set((s.layer_ops || []).map(o => o.type.toLowerCase())),
            }))
            : detectAllRepeatedLayers(report.op_analysis[0].top_ops).map(g => ({
                layerCount: g.layerCount,
                structure: g.structure,
                matchingOps: g.matchingOps,
                opTypes: new Set(g.opNames.map(n => n.toLowerCase())),
            }));
        if (groups.length === 0) return;

        const table = document.getElementById('top-ops-table');
        if (!table) return;

        // Build a map: op type (lowercase) → group index
        const opGroupMap = {};
        groups.forEach((g, gi) => {
            g.opTypes.forEach(t => { opGroupMap[t] = gi; });
        });

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const typeCell = row.querySelectorAll('td')[1]; // OP Type column
            if (!typeCell) return;
            const opType = typeCell.textContent.trim().toLowerCase();
            if (opType in opGroupMap) {
                const gi = opGroupMap[opType];
                const g = groups[gi];
                const color = _groupColors[gi % _groupColors.length];
                const badge = document.createElement('span');
                badge.className = 'layer-badge';
                badge.style.background = color + '18';
                badge.style.color = color;
                badge.title = g.layerCount + ' 层 ' + g.structure + ' (结构 ' + (gi + 1) + ')';
                badge.textContent = '×' + g.layerCount;
                typeCell.appendChild(badge);
            }
        });

        // Add summary banner above the table
        const section = document.getElementById('sec-top-ops');
        if (section) {
            const desc = section.querySelector('.text-muted');
            if (desc) {
                const bannerLines = groups.map((g, gi) => {
                    const color = _groupColors[gi % _groupColors.length];
                    return '<span style="color:' + color + ';font-weight:600;">' + g.structure + '</span> (' + g.layerCount + ' 层, ' + g.matchingOps + ' 算子/层)';
                });
                const layerBanner = document.createElement('div');
                layerBanner.className = 'layer-detection-banner';
                layerBanner.innerHTML =
                    '<i data-lucide="repeat" style="width:16px;height:16px;"></i> ' +
                    '检测到 <strong>' + groups.length + ' 组</strong>重复结构: ' + bannerLines.join(' + ');
                desc.after(layerBanner);
                if (window.lucide) lucide.createIcons({ nodes: [layerBanner] });
            }
        }
    }

    // Initialize — restore saved session or generate fresh summary
    const hadSavedSession = loadChatSession();
    setTimeout(() => {
        if (!hadSavedSession) {
            triggerAutoSummary();
        }
        generateSectionInsights();
        markRepeatedLayerOps();
        // Save session after initial generation
        setTimeout(() => saveChatSession(), 500);
    }, 300);
    setupTocTracking();
})();
