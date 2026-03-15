/* ─── Q&A with Screenshot Support ─── */

(function() {
    const input = document.getElementById('qa-input');
    const imagesDiv = document.getElementById('qa-images');
    const fileInput = document.getElementById('qa-file-input');
    if (!input) return;

    let imagePaths = [];

    // ─── Clipboard Paste ───
    input.addEventListener('paste', async e => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                await uploadImage(blob);
                break;
            }
        }
    });

    // ─── Drag-Drop Images ───
    input.addEventListener('dragover', e => {
        e.preventDefault();
        input.style.borderColor = 'var(--accent)';
    });

    input.addEventListener('dragleave', () => {
        input.style.borderColor = '';
    });

    input.addEventListener('drop', async e => {
        e.preventDefault();
        input.style.borderColor = '';
        for (const file of e.dataTransfer.files) {
            if (file.type.startsWith('image/')) {
                await uploadImage(file);
            }
        }
    });

    // ─── File Picker ───
    if (fileInput) {
        fileInput.addEventListener('change', async () => {
            for (const file of fileInput.files) {
                await uploadImage(file);
            }
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
            renderPreviews();
        } catch (err) {
            console.error('Image upload failed:', err);
        }
    }

    function renderPreviews() {
        imagesDiv.innerHTML = '';
        imagePaths.forEach((url, i) => {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'qa-image-preview';
            img.title = '点击移除';
            img.addEventListener('click', () => {
                imagePaths.splice(i, 1);
                renderPreviews();
            });
            imagesDiv.appendChild(img);
        });
    }

    // ─── Submit ───
    window.submitQuestion = async function() {
        const question = input.value.trim();
        if (!question) return;

        const btn = document.getElementById('qa-submit');
        btn.disabled = true;
        btn.textContent = '提交中...';

        // Auto-capture context: which report section is visible
        let context = null;
        const sections = document.querySelectorAll('.section-title');
        for (const s of sections) {
            const rect = s.getBoundingClientRect();
            if (rect.top >= 0 && rect.top < window.innerHeight) {
                context = s.textContent;
                break;
            }
        }

        try {
            const resp = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    job_id: window.__JOB_ID__ || null,
                    question: question,
                    context: context,
                    image_paths: imagePaths,
                }),
            });

            if (resp.ok) {
                input.value = '';
                imagePaths = [];
                imagesDiv.innerHTML = '';
                btn.textContent = '已提交 ✓';
                setTimeout(() => {
                    btn.textContent = '提交问题';
                    btn.disabled = false;
                }, 2000);
            } else {
                throw new Error(resp.statusText);
            }
        } catch (err) {
            btn.textContent = '提交失败';
            btn.disabled = false;
            console.error(err);
        }
    };
})();
