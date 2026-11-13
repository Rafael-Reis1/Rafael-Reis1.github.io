(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.BookletCore = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * Compute front/back sheet imposition for saddle-stitch booklet or fixed-size signatures.
     * Pages above totalOriginalPages represent blank padding pages.
     * @param {number} totalOriginalPages
     * @param {number} [signatureSize=0] Pages per signature (multiple of 4), or 0 for single booklet.
     * @returns {Array<{sheetNumber: number, signatureNumber: number, front: {left: number, right: number}, back: {left: number, right: number}}>}
     */
    function calculateImposition(totalOriginalPages, signatureSize = 0) {
        const total = Math.floor(Number(totalOriginalPages) || 0);
        if (total <= 0) return [];

        const rawSig = Math.max(0, Math.floor(Number(signatureSize) || 0));
        const normalizedSig = rawSig > 0 ? Math.max(4, Math.ceil(rawSig / 4) * 4) : 0;

        const sheets = [];
        let p = 1;
        let signatureNumber = 1;

        while (p <= total) {
            const pagesLeft = total - p + 1;
            let currentSize;

            if (normalizedSig === 0) {
                currentSize = Math.ceil(total / 4) * 4;
            } else if (pagesLeft < normalizedSig) {
                currentSize = Math.ceil(pagesLeft / 4) * 4;
            } else {
                currentSize = normalizedSig;
            }

            const start = p;
            const end = p + currentSize - 1;
            const count = currentSize / 4;

            let s = start;
            let e = end;

            for (let i = 0; i < count; i++) {
                sheets.push({
                    sheetNumber: sheets.length + 1,
                    signatureNumber,
                    front: { left: e, right: s },
                    back: { left: s + 1, right: e - 1 }
                });
                s += 2;
                e -= 2;
            }

            p += currentSize;
            signatureNumber++;
        }

        return sheets;
    }

    /**
     * Summarize booklet sheet count, blank padding, and signature count.
     * @param {number} totalOriginalPages
     * @param {number} [signatureSize=0]
     */
    function getBookletStats(totalOriginalPages, signatureSize = 0) {
        const sheets = calculateImposition(totalOriginalPages, signatureSize);
        const total = Math.max(0, Math.floor(Number(totalOriginalPages) || 0));
        const paddedPages = sheets.length * 4;
        const blankPages = Math.max(0, paddedPages - total);
        const signaturesCount = sheets.length > 0 ? sheets[sheets.length - 1].signatureNumber : 0;

        return {
            totalOriginalPages: total,
            paddedPages,
            blankPages,
            totalSheets: sheets.length,
            totalBookletPages: sheets.length * 2,
            signaturesCount,
            signatureSize: Math.max(0, Math.floor(Number(signatureSize) || 0))
        };
    }

    /**
     * Build a concise human-readable summary in Portuguese for preview/success UI.
     */
    function formatBookletSummary(stats, bindingLabel = '') {
        if (!stats || stats.totalSheets === 0) return '';
        const folhaLabel = stats.totalSheets === 1 ? '1 folha A4' : `${stats.totalSheets} folhas A4`;
        const pagesLabel = stats.totalOriginalPages === 1 ? '1 pág.' : `${stats.totalOriginalPages} págs.`;
        const blankPart = stats.blankPages > 0 ? ` + ${stats.blankPages} em branco` : '';
        const sigPart = stats.signaturesCount > 1 ? ` · ${stats.signaturesCount} cadernos` : '';
        const modePart = bindingLabel ? ` · ${bindingLabel}` : '';
        return `${folhaLabel} (${pagesLabel}${blankPart}${sigPart})${modePart}`;
    }

    /**
     * Fit and center source page dimensions inside a target rectangular slot without distortion.
     */
    function computeContainedPlacement(srcWidth, srcHeight, slotX, slotY, slotWidth, slotHeight) {
        const w = Number(srcWidth);
        const h = Number(srcHeight);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
            return { x: slotX, y: slotY, width: slotWidth, height: slotHeight };
        }
        const scale = Math.min(slotWidth / w, slotHeight / h);
        const drawWidth = w * scale;
        const drawHeight = h * scale;
        return {
            x: slotX + (slotWidth - drawWidth) / 2,
            y: slotY + (slotHeight - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight
        };
    }

    /**
     * Validate a File/Blob dropped or selected as PDF, supporting browsers that omit file.type.
     */
    function isSupportedPdfFile(file) {
        if (!file) return false;
        const type = String(file.type || '').toLowerCase();
        const name = String(file.name || '').trim();
        if (type === 'application/pdf' || type === 'application/x-pdf') {
            return true;
        }
        return (!type || type === 'application/octet-stream') && /\.pdf$/i.test(name);
    }

    /**
     * Build sanitized download filename for generated booklet PDF.
     */
    function getBookletOutputName(originalName) {
        const raw = String(originalName || 'documento.pdf').split(/[\\/]/).pop().trim() || 'documento.pdf';
        const safeBase = raw.replace(/[<>:"|?*\x00-\x1f]/g, '_');
        const withExt = /\.pdf$/i.test(safeBase) ? safeBase : `${safeBase}.pdf`;
        return `formatado_booklet_${withExt}`;
    }

    return {
        calculateImposition,
        getBookletStats,
        formatBookletSummary,
        computeContainedPlacement,
        isSupportedPdfFile,
        getBookletOutputName
    };
});
