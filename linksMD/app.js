(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.LinksCore = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    /**
     * Strips trailing punctuation cleanly while preserving balanced URL parentheses.
     * @param {string} rawUrl
     * @returns {string}
     */
    function trimTrailingPunctuation(rawUrl) {
        let url = rawUrl.replace(/^[("'[<]+/, '').replace(/[.,;!?'"]+$/, '');
        while (url.endsWith(')') || url.endsWith(']') || url.endsWith('>')) {
            const closer = url.slice(-1);
            const opener = closer === ')' ? '(' : closer === ']' ? '[' : '<';
            const openCount = (url.match(new RegExp(`\\${opener}`, 'g')) || []).length;
            const closeCount = (url.match(new RegExp(`\\${closer}`, 'g')) || []).length;
            if (closeCount > openCount) {
                url = url.slice(0, -1).replace(/[.,;!?'"]+$/, '');
            } else {
                break;
            }
        }
        return url;
    }

    /**
     * Extracts valid HTTP(S) and www URLs from arbitrary raw text.
     * @param {string} rawText
     * @param {boolean} [dedupe=true]
     * @returns {string[]}
     */
    function extractUrls(rawText, dedupe = true) {
        const text = String(rawText || '');
        const regex = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
        const matches = text.match(regex) || [];
        const urls = [];
        const seen = new Set();

        for (const match of matches) {
            let cleaned = trimTrailingPunctuation(match);
            if (!cleaned) continue;
            if (/^www\./i.test(cleaned)) {
                cleaned = `https://${cleaned}`;
            }
            try {
                const parsed = new URL(cleaned);
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
                const normalized = parsed.href;
                if (dedupe) {
                    if (seen.has(normalized)) continue;
                    seen.add(normalized);
                }
                urls.push(normalized);
            } catch (_) {
                // Skip invalid URL tokens cleanly
            }
        }
        return urls;
    }

    /**
     * Builds a friendly descriptive Markdown link title for a parsed URL.
     * Escapes square brackets to avoid breaking Markdown link syntax.
     * @param {string} urlStr
     * @returns {string}
     */
    function buildMarkdownTitle(urlStr) {
        let titulo = urlStr;
        try {
            const urlObj = new URL(urlStr);
            const dominio = urlObj.hostname.replace(/^www\./i, '').toLowerCase();
            const path = urlObj.pathname;
            const params = urlObj.searchParams;

            if (dominio.includes('rafael-reis1.github.io')) {
                titulo = 'Portfólio do Rafael Reis';
            } else if (dominio.includes('totvs.com') && params.has('pageId')) {
                titulo = `Documentação TOTVS (ID: ${params.get('pageId')})`;
            } else if (dominio === 'youtu.be') {
                const videoId = path.replace(/^\/+/, '').split('/')[0];
                titulo = videoId ? `YouTube - Vídeo (${videoId})` : 'YouTube Link';
            } else if (dominio.includes('youtube.com')) {
                if (params.has('v')) {
                    titulo = `YouTube - Vídeo (${params.get('v')})`;
                } else if (path.startsWith('/shorts/')) {
                    const shortId = path.split('/')[2];
                    titulo = shortId ? `YouTube Shorts (${shortId})` : 'YouTube Shorts';
                } else if (path.includes('@')) {
                    titulo = `YouTube - Canal (${path.replace(/^\/+/, '')})`;
                } else {
                    titulo = 'YouTube Link';
                }
            } else if (dominio.includes('github.com')) {
                const repoInfo = path.replace(/^\/+/, '').replace(/\/+$/, '');
                titulo = repoInfo ? `GitHub: ${repoInfo}` : 'GitHub Home';
            } else if (dominio.includes('linkedin.com')) {
                if (path.includes('/in/')) {
                    const profile = path.split('/in/')[1].replace(/\/+$/, '');
                    titulo = profile ? `LinkedIn Perfil: ${profile}` : 'LinkedIn';
                } else {
                    titulo = 'LinkedIn';
                }
            } else if (dominio.includes('instagram.com')) {
                const user = path.split('/').filter(Boolean)[0];
                titulo = user ? `Instagram: @${user.replace(/^@/, '')}` : 'Instagram';
            } else if (dominio.includes('docs.google.com')) {
                titulo = 'Documento Google';
            } else {
                const cleanPath = path === '/' ? '' : path.replace(/\/+$/, '');
                titulo = `${dominio}${cleanPath}`;
            }
        } catch (_) {
            titulo = urlStr;
        }

        return String(titulo).replace(/([[\]])/g, '\\$1');
    }

    /**
     * Converts raw text containing URLs into Markdown links.
     * @param {string} rawText
     * @param {{dedupe?: boolean, asBulletList?: boolean}} [options]
     * @returns {{items: Array<{url: string, title: string, line: string}>, count: number, markdown: string}}
     */
    function generateMarkdown(rawText, options = {}) {
        const { dedupe = true, asBulletList = false } = options;
        const urls = extractUrls(rawText, dedupe);
        const items = urls.map(url => {
            const title = buildMarkdownTitle(url);
            const link = `[${title}](${url})`;
            return {
                url,
                title,
                line: asBulletList ? `- ${link}` : link
            };
        });

        return {
            items,
            count: items.length,
            markdown: items.map(i => i.line).join('\n')
        };
    }

    function initDom() {
        if (typeof document === 'undefined') return;
        const Tools = root.MiniTools;
        if (!Tools) return;

        Tools.bindHomeButton('#btnVoltar');

        const inputEl = document.getElementById('links');
        const dedupeEl = document.getElementById('removerDuplicados');
        const bulletEl = document.getElementById('formatoLista');
        const statsEl = document.getElementById('links-stats');
        const previewWrap = document.getElementById('previewWrapper');
        const previewEl = document.getElementById('markdownPreview');
        const btnDownload = document.getElementById('gerarArquivo');
        const btnCopy = document.getElementById('copiarMarkdown');
        const btnClear = document.getElementById('limpar');

        function computeCurrent() {
            return generateMarkdown(inputEl ? inputEl.value : '', {
                dedupe: !dedupeEl || dedupeEl.checked,
                asBulletList: Boolean(bulletEl && bulletEl.checked)
            });
        }

        function updatePreview() {
            const res = computeCurrent();
            if (statsEl) {
                statsEl.textContent = res.count === 1 ? '1 link detectado' : `${res.count} links detectados`;
            }
            if (previewWrap && previewEl) {
                if (res.count > 0) {
                    previewEl.textContent = res.markdown;
                    previewWrap.hidden = false;
                } else {
                    previewEl.textContent = '';
                    previewWrap.hidden = true;
                }
            }
        }

        function downloadMarkdownFile() {
            const res = computeCurrent();
            if (res.count === 0) {
                Tools.showToast('Nenhum link válido encontrado!', 'error');
                return;
            }
            const blob = new Blob([res.markdown], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'links.md';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => {
                try { URL.revokeObjectURL(url); } catch (_) { }
            }, 5000);
            Tools.showToast(`Arquivo links.md gerado (${res.count} links)!`, 'success', 1800);
        }

        async function copyMarkdown() {
            const res = computeCurrent();
            if (res.count === 0) {
                Tools.showToast('Nenhum link válido encontrado!', 'error');
                return;
            }
            const ok = await Tools.copyText(res.markdown);
            if (ok) {
                Tools.flashButtonText(btnCopy, 'Copiado!');
                Tools.showToast(`${res.count} links em Markdown copiados!`, 'success', 1500);
            } else {
                Tools.showToast('Não foi possível copiar o Markdown.', 'error');
            }
        }

        if (inputEl) inputEl.addEventListener('input', updatePreview);
        if (dedupeEl) dedupeEl.addEventListener('change', updatePreview);
        if (bulletEl) bulletEl.addEventListener('change', updatePreview);

        Tools.bindCtrlEnter(inputEl, copyMarkdown);

        if (btnDownload) btnDownload.addEventListener('click', downloadMarkdownFile);
        if (btnCopy) btnCopy.addEventListener('click', copyMarkdown);
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                if (inputEl) inputEl.value = '';
                updatePreview();
                if (inputEl) inputEl.focus();
            });
        }

        updatePreview();

        root.__linksApp = {
            extractUrls,
            buildMarkdownTitle,
            generateMarkdown
        };
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initDom);
        } else {
            initDom();
        }
    }

    return {
        extractUrls,
        buildMarkdownTitle,
        generateMarkdown
    };
});
