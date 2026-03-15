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

    function uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        dropzone.style.display = 'none';
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
                uploadStatus.textContent = '上传完成，开始分析...';
                pollJobStatus(data.id);
            } else {
                try {
                    const err = JSON.parse(xhr.responseText);
                    uploadStatus.textContent = '上传失败: ' + (err.detail || xhr.statusText);
                } catch(e) {
                    uploadStatus.textContent = '上传失败: ' + xhr.statusText;
                }
                uploadStatus.style.color = 'var(--danger)';
            }
        };

        xhr.onerror = () => {
            uploadStatus.textContent = '网络错误';
            uploadStatus.style.color = 'var(--danger)';
        };

        xhr.send(formData);
    }

    function pollJobStatus(jobId) {
        const es = new EventSource('/api/jobs/' + jobId + '/events');

        es.addEventListener('status', e => {
            const d = JSON.parse(e.data);
            uploadStatus.textContent = '状态: ' + d.status;
            if (d.status === 'done') {
                es.close();
                window.location.href = '/report/' + jobId;
            } else if (d.status === 'failed') {
                es.close();
                uploadStatus.textContent = '分析失败: ' + (d.error || '未知错误');
                uploadStatus.style.color = 'var(--danger)';
            }
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
