/* ─── Perfetto Embedded Viewer (Same-Origin Proxy) ─── */

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

        // Show the iframe container
        container.style.display = 'block';
        btn.style.display = 'none';

        // Load Perfetto via same-origin proxy (/perfetto/ → ui.perfetto.dev)
        // This avoids cross-origin issues with postMessage and iframe embedding.
        // The proxy also handles /v{version}/... asset paths.
        iframe.src = '/perfetto/';

        waitForPerfettoReady(iframe, buf, jobId, statusEl);

    } catch (err) {
        statusEl.textContent = '加载失败: ' + err.message;
        btn.disabled = false;
    }
}

function waitForPerfettoReady(iframe, buf, jobId, statusEl) {
    let pingTimer = null;
    let timeoutTimer = null;
    let settled = false;

    function cleanup() {
        settled = true;
        if (pingTimer) clearInterval(pingTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        window.removeEventListener('message', onMessage);
    }

    function onMessage(evt) {
        if (settled) return;
        if (evt.data !== 'PONG') return;

        cleanup();

        // Send the trace data (same-origin, so '*' target origin is fine)
        iframe.contentWindow.postMessage({
            perfetto: {
                buffer: buf,
                title: 'Ascend Profiling - Job ' + jobId,
            }
        }, '*');

        statusEl.textContent = 'Trace 已加载到 Perfetto 视图中';
    }

    window.addEventListener('message', onMessage);

    // Start pinging after iframe loads
    iframe.onload = function() {
        statusEl.textContent = '等待 Perfetto 初始化...';
        pingTimer = setInterval(function() {
            if (settled) return;
            try {
                iframe.contentWindow.postMessage('PING', '*');
            } catch(e) {}
        }, 200);
    };

    // Timeout after 90 seconds (Perfetto may need to download WASM)
    timeoutTimer = setTimeout(function() {
        if (settled) return;
        cleanup();
        statusEl.textContent = 'Perfetto 初始化超时。请检查网络连接后刷新页面重试。';
    }, 90000);
}
