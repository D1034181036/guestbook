// Google Sheets 留言簿：https://github.com/D1034181036/guestbook
(function() {
    const STORAGE_KEY = 'guestbook_visitor';

    function init() {
        const form = document.getElementById('gb-form');
        const container = document.getElementById('gb-messages');

        if (form) setupForm(form);
        if (container) renderMessages(container, container.dataset.source || (form && form.action));
    }

    function setupForm(form) {
        const errorBox = form.querySelector('.gb-error');
        const successBox = form.querySelector('.gb-success');
        const submitButton = form.querySelector('button[type="submit"]');

        restoreVisitor(form);

        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            errorBox.textContent = '';
            successBox.hidden = true;

            const data = {
                name: form.elements.name.value.trim(),
                website: form.elements.website.value.trim(),
                text: form.elements.text.value.trim()
            };

            const originalButtonText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = '送出中...';
            let cooldown = 0;

            try {
                const response = await fetch(form.action, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(data)
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const result = await response.json();
                if (!result.success) {
                    errorBox.textContent = result.error || '提交失敗，請稍後再試';
                    return;
                }

                saveVisitor(data);
                form.reset();
                restoreVisitor(form);
                successBox.hidden = false;
                successBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                submitButton.textContent = '已送出';
                cooldown = 3000;
            } catch (error) {
                console.error('提交錯誤:', error);
                errorBox.textContent = '提交失敗，請稍後再試';
            } finally {
                setTimeout(() => {
                    submitButton.disabled = false;
                    submitButton.textContent = originalButtonText;
                }, cooldown);
            }
        });
    }

    function restoreVisitor(form) {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved) return;
            if (saved.name) form.elements.name.value = saved.name;
            if (saved.website) form.elements.website.value = saved.website;
        } catch (e) {
            // localStorage 不可用或資料損毀時忽略
        }
    }

    function saveVisitor({ name, website }) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, website }));
        } catch (e) {
            // localStorage 不可用時忽略
        }
    }

    async function renderMessages(container, source) {
        const defaultReplyName = container.dataset.replyName || '站長回覆';
        container.innerHTML = '<p class="gb-status">載入留言中...</p>';

        try {
            const url = new URL(source, location.href);
            url.searchParams.set('t', Date.now());
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();
            const messages = result.success && Array.isArray(result.messages) ? result.messages : [];

            container.innerHTML = messages.length
                ? messages.map(msg => renderMessage(msg, defaultReplyName)).join('')
                : '<p class="gb-status">還沒有留言，成為第一個留言的人吧！</p>';
        } catch (error) {
            console.error('載入留言錯誤:', error);
            container.innerHTML = '<p class="gb-status gb-status-error">載入留言失敗，請稍後再試</p>';
        }
    }

    // 回覆是站長自己在試算表寫的，允許 HTML；訪客的 name / text / website 一律轉義或驗證
    function renderMessage(msg, defaultReplyName) {
        const url = safeUrl(msg.website);
        const name = escapeHtml(msg.name);
        const nameDisplay = url
            ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
            : name;

        let html = `
            <div class="gb-message">
                <p><b>${nameDisplay}</b> <small> - ${formatDate(msg.timestamp)}</small></p>
                <blockquote>${escapeHtml(msg.text)}</blockquote>
            </div>`;

        if (msg.reply && msg.reply.trim()) {
            const replyName = escapeHtml(msg.replyName && msg.replyName.trim() ? msg.replyName : defaultReplyName);
            const replyTime = msg.replyTime ? ` <small> - ${formatDate(msg.replyTime)}</small>` : '';
            html += `
            <div class="gb-message gb-reply">
                <p><b>${replyName}</b>${replyTime}</p>
                <blockquote>${msg.reply}</blockquote>
            </div>`;
        }

        return html;
    }

    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeUrl(url) {
        try {
            const parsed = new URL(String(url).trim());
            return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : null;
        } catch (e) {
            return null;
        }
    }

    function formatDate(timestamp) {
        if (!timestamp) return '';
        const matched = String(timestamp).match(/(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/);
        return escapeHtml(matched ? matched[1].replace(/\//g, '-') : timestamp);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
