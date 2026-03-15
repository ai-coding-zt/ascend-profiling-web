/* ─── Perfetto postMessage Integration ─── */

async function openInPerfetto(jobId) {
    const statusEl = document.getElementById('trace-status');
    if (!statusEl) return;

    statusEl.textContent = '正在加载 Trace 文件...';

    try {
        const resp = await fetch('/api/jobs/' + jobId + '/trace');
        if (!resp.ok) {
            statusEl.textContent = '加载失败: ' + resp.statusText;
            return;
        }

        const blob = await resp.blob();
        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        statusEl.textContent = 'Trace 文件已加载 (' + sizeMB + ' MB)，正在打开 Perfetto...';

        if (blob.size > 500 * 1024 * 1024) {
            statusEl.textContent += ' (文件较大，加载可能需要一些时间)';
        }

        const buf = await blob.arrayBuffer();
        const win = window.open('https://ui.perfetto.dev/');

        if (!win) {
            statusEl.textContent = '请允许弹窗以打开 Perfetto (浏览器可能阻止了弹窗)';
            return;
        }

        const timer = setInterval(() => win.postMessage('PING', '*'), 50);
        const timeout = setTimeout(() => {
            clearInterval(timer);
            statusEl.textContent = 'Perfetto 连接超时，请刷新重试';
        }, 30000);

        window.addEventListener('message', function handler(evt) {
            if (evt.data !== 'PONG') return;
            clearInterval(timer);
            clearTimeout(timeout);
            window.removeEventListener('message', handler);

            win.postMessage({
                perfetto: {
                    buffer: buf,
                    title: 'Ascend Profiling - Job ' + jobId,
                }
            }, '*');

            statusEl.textContent = 'Trace 已在 Perfetto 中打开';
        });

    } catch (err) {
        statusEl.textContent = '加载失败: ' + err.message;
    }
}
