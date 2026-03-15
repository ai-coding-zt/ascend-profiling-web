/* ─── Perfetto Embedded Viewer ─── */

async function loadPerfettoTrace(jobId) {
    const statusEl = document.getElementById('trace-status');
    const container = document.getElementById('perfetto-container');
    const iframe = document.getElementById('perfetto-iframe');
    const btn = document.getElementById('trace-open-btn');
    if (!statusEl || !container || !iframe) return;

    btn.disabled = true;
    statusEl.textContent = '正在加载 Trace 文件...';

    try {
        const resp = await fetch('/api/jobs/' + jobId + '/trace');
        if (!resp.ok) {
            statusEl.textContent = '加载失败: ' + resp.statusText;
            btn.disabled = false;
            return;
        }

        const blob = await resp.blob();
        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        statusEl.textContent = 'Trace 文件已加载 (' + sizeMB + ' MB)，正在启动 Perfetto...';

        const buf = await blob.arrayBuffer();

        // Determine Perfetto UI URL: self-hosted or CDN
        let perfettoUrl = 'https://ui.perfetto.dev/';
        try {
            const check = await fetch('/static/perfetto/index.html', { method: 'HEAD' });
            if (check.ok) perfettoUrl = '/static/perfetto/';
        } catch(e) {}

        // Show the iframe container
        container.style.display = 'block';
        btn.style.display = 'none';

        // For self-hosted (same origin), use iframe directly
        // For cross-origin (ui.perfetto.dev), use window.open as fallback
        if (perfettoUrl.startsWith('/')) {
            // Self-hosted: iframe + postMessage
            iframe.src = perfettoUrl;
            iframe.onload = function() {
                sendTraceToFrame(iframe.contentWindow, buf, jobId, statusEl);
            };
        } else {
            // Cross-origin: open in new window (iframe blocked by X-Frame-Options)
            container.style.display = 'none';
            btn.style.display = '';
            btn.disabled = false;
            openPerfettoWindow(perfettoUrl, buf, jobId, statusEl);
        }

    } catch (err) {
        statusEl.textContent = '加载失败: ' + err.message;
        btn.disabled = false;
    }
}

function sendTraceToFrame(targetWin, buf, jobId, statusEl) {
    const timer = setInterval(() => targetWin.postMessage('PING', '*'), 50);
    const timeout = setTimeout(() => {
        clearInterval(timer);
        statusEl.textContent = 'Perfetto 连接超时，请刷新重试';
    }, 30000);

    window.addEventListener('message', function handler(evt) {
        if (evt.data !== 'PONG') return;
        clearInterval(timer);
        clearTimeout(timeout);
        window.removeEventListener('message', handler);

        targetWin.postMessage({
            perfetto: {
                buffer: buf,
                title: 'Ascend Profiling - Job ' + jobId,
            }
        }, '*');

        statusEl.textContent = 'Trace 已加载到 Perfetto 视图中';
    });
}

function openPerfettoWindow(baseUrl, buf, jobId, statusEl) {
    statusEl.textContent = '正在打开 Perfetto 窗口...';
    const win = window.open(baseUrl);

    if (!win) {
        statusEl.textContent = '请允许弹窗以打开 Perfetto (浏览器可能阻止了弹窗)';
        return;
    }

    sendTraceToFrame(win, buf, jobId, statusEl);
}
