/* ─── Upload & Drag-Drop ─── */

(function() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const progressDiv = document.getElementById('upload-progress');
    const progressFill = document.getElementById('progress-fill');
    const uploadStatus = document.getElementById('upload-status');

    if (!dropzone) return;

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', e => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) uploadFile(fileInput.files[0]);
    });

    let _currentFilename = '';

    function uploadFile(file) {
        _currentFilename = file.name;
        const formData = new FormData();
        formData.append('file', file);

        dropzone.style.display = 'none';
        // Also hide the AI greeting if present
        const greeting = document.querySelector('.ai-greeting');
        if (greeting) greeting.style.display = 'none';

        progressDiv.style.display = 'block';

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/jobs');

        xhr.upload.onprogress = e => {
            if (e.lengthComputable) {
                const pct = Math.round(e.loaded / e.total * 100);
                progressFill.style.width = pct + '%';
                uploadStatus.textContent = `上传中... ${pct}% (${(e.loaded/1024/1024).toFixed(1)} MB / ${(e.total/1024/1024).toFixed(1)} MB)`;
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                progressFill.style.width = '100%';
                uploadStatus.textContent = '上传完成，开始分析...';
                pollJobStatus(data.id);
            } else {
                let errorMsg = xhr.statusText;
                try {
                    const err = JSON.parse(xhr.responseText);
                    errorMsg = err.detail || xhr.statusText;
                } catch(e) {}
                showUploadError('上传失败', errorMsg);
            }
        };

        xhr.onerror = () => {
            showUploadError('网络错误', '无法连接到服务器，请检查网络后重试。');
        };

        xhr.send(formData);
    }

    function showUploadError(title, detail) {
        uploadStatus.innerHTML = '';
        progressFill.style.width = '100%';
        progressFill.style.background = 'var(--danger)';

        uploadStatus.style.color = 'var(--danger)';
        uploadStatus.textContent = title;

        // Show error modal if available
        if (typeof showErrorModal === 'function') {
            showErrorModal(_currentFilename, detail);
        }

        // Show retry button
        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn btn-secondary';
        retryBtn.style.marginTop = '8px';
        retryBtn.innerHTML = '<i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> 重新上传';
        retryBtn.onclick = () => {
            progressDiv.style.display = 'none';
            progressFill.style.width = '0%';
            progressFill.style.background = '';
            uploadStatus.style.color = '';
            dropzone.style.display = '';
            const greeting = document.querySelector('.ai-greeting');
            if (greeting) greeting.style.display = '';
        };
        uploadStatus.after(retryBtn);
        if (window.lucide) lucide.createIcons();
    }

    function pollJobStatus(jobId) {
        const es = new EventSource('/api/jobs/' + jobId + '/events');

        es.addEventListener('status', e => {
            const d = JSON.parse(e.data);
            const statusMap = {
                'queued': '排队中...',
                'unpacking': '解压中...',
                'analyzing': '分析中...',
            };
            uploadStatus.textContent = statusMap[d.status] || ('状态: ' + d.status);

            if (d.status === 'done') {
                es.close();
                window.location.href = '/report/' + jobId;
            } else if (d.status === 'failed') {
                es.close();
                const errorDetail = d.error || '未知错误';
                showUploadError('分析失败', errorDetail);
            }
        });

        es.addEventListener('error_detail', e => {
            // Additional error event with traceback
            try {
                const d = JSON.parse(e.data);
                if (d.traceback && typeof showErrorModal === 'function') {
                    showErrorModal(_currentFilename, d.error + '\n\n' + d.traceback);
                }
            } catch(ex) {}
        });

        es.addEventListener('done', () => {
            es.close();
            window.location.href = '/report/' + jobId;
        });

        es.addEventListener('error', () => {
            // SSE reconnect will handle transient errors
        });
    }
})();
