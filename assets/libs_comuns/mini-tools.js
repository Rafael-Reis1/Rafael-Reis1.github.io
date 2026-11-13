(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MiniTools = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    let toastTimer = null;

    /**
     * Binds the shared Home/Back button without breaking subpath hosting.
     * Respects optional data-back-href on the button element.
     * @param {string} [selector='#btnVoltar']
     * @param {string} [defaultHref='../']
     */
    function bindHomeButton(selector = '#btnVoltar', defaultHref = '../') {
        const btn = typeof document !== 'undefined' ? document.querySelector(selector) : null;
        if (!btn) return;
        btn.addEventListener('click', () => {
            const explicitBack = btn.dataset && btn.dataset.backHref;
            if (explicitBack && typeof window !== 'undefined') {
                window.location.href = explicitBack;
                return;
            }
            if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
                window.close();
            } else if (typeof window !== 'undefined') {
                window.location.href = defaultHref;
            }
        });
    }

    /**
     * Copies text using the async Clipboard API with a safe textarea fallback.
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async function copyText(text) {
        if (text == null) return false;
        const value = String(text);
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(value);
                return true;
            } catch (_) {
                // Fall back to execCommand
            }
        }
        if (typeof document === 'undefined' || !document.body) return false;
        try {
            const temp = document.createElement('textarea');
            temp.value = value;
            temp.setAttribute('readonly', '');
            temp.style.position = 'fixed';
            temp.style.opacity = '0';
            temp.style.left = '-9999px';
            document.body.appendChild(temp);
            temp.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(temp);
            return Boolean(ok);
        } catch (_) {
            return false;
        }
    }

    /**
     * Temporarily changes a button's label while safely restoring the original label across rapid clicks.
     * @param {HTMLElement|null} btn
     * @param {string} [tempLabel='Copiado!']
     * @param {number} [duration=1600]
     */
    function flashButtonText(btn, tempLabel = 'Copiado!', duration = 1600) {
        if (!btn) return;
        if (!btn.dataset.origLabel) {
            btn.dataset.origLabel = btn.textContent;
        }
        const timerId = Number(btn.dataset.flashTimerId || 0);
        if (timerId) clearTimeout(timerId);
        btn.textContent = tempLabel;
        const nextTimer = setTimeout(() => {
            btn.textContent = btn.dataset.origLabel || tempLabel;
            delete btn.dataset.flashTimerId;
        }, duration);
        btn.dataset.flashTimerId = String(nextTimer);
    }

    /**
     * Shows a non-blocking accessible toast notification.
     * @param {string} message
     * @param {'info'|'success'|'error'} [variant='info']
     * @param {number} [duration=2000]
     */
    function showToast(message, variant = 'info', duration = 2000) {
        if (typeof document === 'undefined' || !document.body) return;
        let toast = document.getElementById('tool-toast') || document.getElementById('notificacao-copia');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'tool-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }
        toast.className = 'tool-toast';
        if (variant === 'success') toast.classList.add('is-success');
        if (variant === 'error') toast.classList.add('is-error');
        toast.textContent = message;

        clearTimeout(toastTimer);
        toast.classList.add('is-visible');
        toastTimer = setTimeout(() => {
            toast.classList.remove('is-visible');
        }, duration);
    }

    /**
     * Creates a race-free accessible modal controller using CSS classes & ARIA attributes.
     * @param {HTMLElement|null} overlayEl
     * @param {{backdropEl?: HTMLElement|null, closeButtons?: HTMLElement[]}} [opts]
     */
    function createPopupController(overlayEl, opts = {}) {
        const isOpen = () => Boolean(overlayEl && overlayEl.classList.contains('is-open'));

        function open() {
            if (!overlayEl) return;
            overlayEl.removeAttribute('hidden');
            overlayEl.setAttribute('aria-hidden', 'false');
            overlayEl.classList.add('is-open');
        }

        function close() {
            if (!overlayEl) return;
            overlayEl.classList.remove('is-open');
            overlayEl.setAttribute('aria-hidden', 'true');
        }

        if (opts.backdropEl) {
            opts.backdropEl.addEventListener('click', close);
        }
        (opts.closeButtons || []).forEach(btn => {
            if (btn) btn.addEventListener('click', close);
        });
        if (typeof document !== 'undefined') {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && isOpen()) {
                    close();
                }
            });
        }

        return { open, close, isOpen };
    }

    /**
     * Triggers callback when pressing Ctrl+Enter or Cmd+Enter inside an input/textarea.
     * @param {HTMLElement|null} el
     * @param {Function} callback
     */
    function bindCtrlEnter(el, callback) {
        if (!el || typeof callback !== 'function') return;
        el.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                callback();
            }
        });
    }

    return {
        bindHomeButton,
        copyText,
        flashButtonText,
        showToast,
        createPopupController,
        bindCtrlEnter
    };
});
