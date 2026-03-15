/* ─── Agent Chat Widget ─── */

(function() {
    const panel = document.getElementById('chat-panel');
    const toggle = document.getElementById('chat-toggle');
    const input = document.getElementById('chat-input');
    const messagesDiv = document.getElementById('chat-messages');
    const imagesDiv = document.getElementById('chat-images');
    const fileInput = document.getElementById('chat-file-input');
    if (!panel || !input) return;

    let imagePaths = [];
    let isOpen = false;

    // ─── Toggle Chat Panel ───
    window.toggleChat = function() {
        isOpen = !isOpen;
        panel.classList.toggle('open', isOpen);
        toggle.style.display = isOpen ? 'none' : 'flex';
        if (isOpen) input.focus();
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

        let html = '<div class="chat-msg-content">' + escapeHtml(text) + '</div>';
        if (images && images.length > 0) {
            html += '<div class="chat-msg-images">';
            images.forEach(url => {
                html += '<img src="' + escapeHtml(url) + '" alt="截图" onclick="window.open(this.src)">';
            });
            html += '</div>';
        }
        msg.innerHTML = html;
        messagesDiv.appendChild(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return msg;
    }

    function addTypingIndicator() {
        const msg = document.createElement('div');
        msg.className = 'chat-msg chat-msg-bot';
        msg.id = 'chat-typing';
        msg.innerHTML = '<div class="chat-msg-content"><div class="chat-typing"><span></span><span></span><span></span></div></div>';
        messagesDiv.appendChild(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return msg;
    }

    function removeTypingIndicator() {
        const el = document.getElementById('chat-typing');
        if (el) el.remove();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ─── Auto-detect current report section ───
    function getCurrentSection() {
        const sections = document.querySelectorAll('.section-title');
        for (const s of sections) {
            const rect = s.getBoundingClientRect();
            if (rect.top >= 0 && rect.top < window.innerHeight) {
                return s.textContent;
            }
        }
        return null;
    }

    // ─── Send Message ───
    window.sendChatMessage = async function() {
        const text = input.value.trim();
        if (!text && imagePaths.length === 0) return;

        const sendBtn = document.getElementById('chat-send');
        sendBtn.disabled = true;

        // Show user message
        addMessage(text || '(截图)', 'user', [...imagePaths]);

        const context = getCurrentSection();
        const msgImages = [...imagePaths];

        // Clear input
        input.value = '';
        imagePaths = [];
        imagesDiv.innerHTML = '';

        // Show typing indicator
        addTypingIndicator();

        try {
            const resp = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    job_id: window.__JOB_ID__ || null,
                    question: text,
                    context: context,
                    image_paths: msgImages,
                }),
            });

            removeTypingIndicator();

            if (resp.ok) {
                // Bot acknowledgment
                addMessage('已收到你的问题，我们会尽快分析并回复。如果有更多信息，请继续补充。', 'bot');
            } else {
                addMessage('发送失败，请重试。', 'bot');
            }
        } catch (err) {
            removeTypingIndicator();
            addMessage('网络错误，请检查连接后重试。', 'bot');
            console.error(err);
        }

        sendBtn.disabled = false;
        input.focus();
    };
})();
