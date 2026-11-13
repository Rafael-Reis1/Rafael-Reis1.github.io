let memeTopText = '';
let memeBottomText = '';

const MEME_TEMPLATES = [
    { top: "QUANDO O CLIENTE", bottom: "PEDE PRA AUMENTAR A LOGO" },
    { top: "EXPECTATIVA", bottom: "REALIDADE" },
    { top: "QUANDO VÊ", bottom: "JÁ É TERÇA-FEIRA" },
    { top: "O QUE FAZEMOS HOJE?", bottom: "O MESMO DE SEMPRE, PINKY" },
    { top: "CONFIA", bottom: "VAI DAR CERTO" },
    { top: "EU VENDO O BUG", bottom: "QUE EU MESMO CRIEI" },
    { top: "NA MINHA MÁQUINA", bottom: "FUNCIONA" },
    { top: "QUANDO O CHEFE CHEGA", bottom: "E EU TÔ NO YOUTUBE" },
    { top: "SENIOR DEVELOPER", bottom: "PESQUISANDO COMO CENTRALIZAR DIV" },
    { top: "O PRAZO ERA ONTEM?", bottom: "" },
    { top: "QUANDO O SQL", bottom: "VOLTA SEM WHERE" },
    { top: "GIMME", bottom: "COFFEE" },
    { top: "", bottom: "SÓ PEÇO PACIÊNCIA" },
    { top: "A MIMIR", bottom: "" },
    { top: "MUITO TEXTO", bottom: "NÃO VOU LER" }
];

function buildMemeControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Texto Superior</label>
            <input type="text" id="memeTop" class="text-input" placeholder="DIGITE ALGO..." oninput="updateMemeText('top', this.value)">
            
            <label style="margin-top: 1rem;">Texto Inferior</label>
            <input type="text" id="memeBottom" class="text-input" placeholder="MEME TEXT" oninput="updateMemeText('bottom', this.value)">
            
            <button class="btn-secondary" onclick="generateRandomMeme()" style="margin-top: 1rem; width: 100%;">
                🎲 Texto Aleatório
            </button>
            <p style="margin-top: 1rem; font-size: 0.9rem; opacity: 0.7;">
                💡 A fonte é ajustada automaticamente para caber na imagem.
            </p>
        </div>
    `;

    memeTopText = '';
    memeBottomText = '';
    applyMemePreview();
}

function generateRandomMeme() {
    const random = MEME_TEMPLATES[Math.floor(Math.random() * MEME_TEMPLATES.length)];

    document.getElementById('memeTop').value = random.top;
    document.getElementById('memeBottom').value = random.bottom;

    updateMemeText('top', random.top);
    updateMemeText('bottom', random.bottom);
}

function updateMemeText(position, text) {
    if (position === 'top') memeTopText = text.toUpperCase();
    if (position === 'bottom') memeBottomText = text.toUpperCase();
    applyMemePreview();
}

function wrapMemeLines(context, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const testLine = `${currentLine} ${words[i]}`;
        if (context.measureText(testLine).width <= maxWidth) {
            currentLine = testLine;
        } else {
            lines.push(currentLine);
            currentLine = words[i];
        }
    }
    lines.push(currentLine);
    return lines;
}

function applyMemePreview() {
    if (!originalImage) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

    if (!memeTopText && !memeBottomText) return;

    const width = canvas.width;
    const height = canvas.height;
    const maxTextWidth = width * 0.92;
    const fontSize = Math.max(18, Math.round(width / 11));
    const lineHeight = fontSize * 1.15;
    const marginY = Math.max(10, Math.round(fontSize * 0.35));

    ctx.save();
    ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = Math.max(2, fontSize / 12);
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';

    if (memeTopText) {
        ctx.textBaseline = 'top';
        const topLines = wrapMemeLines(ctx, memeTopText, maxTextWidth);
        topLines.forEach((line, idx) => {
            const y = marginY + idx * lineHeight;
            ctx.strokeText(line, width / 2, y, maxTextWidth);
            ctx.fillText(line, width / 2, y, maxTextWidth);
        });
    }

    if (memeBottomText) {
        ctx.textBaseline = 'bottom';
        const bottomLines = wrapMemeLines(ctx, memeBottomText, maxTextWidth);
        bottomLines.forEach((line, idx) => {
            const offsetFromBottom = (bottomLines.length - 1 - idx) * lineHeight;
            const y = height - marginY - offsetFromBottom;
            ctx.strokeText(line, width / 2, y, maxTextWidth);
            ctx.fillText(line, width / 2, y, maxTextWidth);
        });
    }
    ctx.restore();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatMetaBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readAscii(view, offset, length) {
    const end = Math.min(view.byteLength, offset + length);
    let out = '';
    for (let i = offset; i < end; i++) {
        const ch = view.getUint8(i);
        if (ch === 0) break;
        if (ch >= 32 && ch <= 126) out += String.fromCharCode(ch);
    }
    return out.trim();
}

function readTiffValue(view, tiffStart, entryOffset, littleEndian) {
    if (entryOffset + 12 > view.byteLength) return null;
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const valueFieldOffset = entryOffset + 8;

    const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const elemSize = typeSizes[type];
    if (!elemSize || count === 0 || count > 2048) return null;

    const totalSize = elemSize * count;
    const dataOffset = totalSize <= 4
        ? valueFieldOffset
        : tiffStart + view.getUint32(valueFieldOffset, littleEndian);

    if (dataOffset < tiffStart || dataOffset + totalSize > view.byteLength) return null;

    if (type === 2) {
        return readAscii(view, dataOffset, count);
    }
    if (type === 3) {
        return count === 1 ? view.getUint16(dataOffset, littleEndian) : null;
    }
    if (type === 4) {
        return count === 1 ? view.getUint32(dataOffset, littleEndian) : null;
    }
    if (type === 5 || type === 10) {
        const values = [];
        const isSigned = type === 10;
        for (let i = 0; i < Math.min(count, 4); i++) {
            const p = dataOffset + i * 8;
            const num = isSigned ? view.getInt32(p, littleEndian) : view.getUint32(p, littleEndian);
            const den = isSigned ? view.getInt32(p + 4, littleEndian) : view.getUint32(p + 4, littleEndian);
            values.push(den !== 0 ? num / den : 0);
        }
        return count === 1 ? values[0] : values;
    }
    return null;
}

function readIfdTagMap(view, tiffStart, ifdRelOffset, littleEndian) {
    const map = new Map();
    const absOffset = tiffStart + ifdRelOffset;
    if (absOffset + 2 > view.byteLength) return map;

    const entryCount = Math.min(128, view.getUint16(absOffset, littleEndian));
    for (let i = 0; i < entryCount; i++) {
        const entryOffset = absOffset + 2 + i * 12;
        if (entryOffset + 12 > view.byteLength) break;
        const tag = view.getUint16(entryOffset, littleEndian);
        const val = readTiffValue(view, tiffStart, entryOffset, littleEndian);
        if (val !== null && val !== '') {
            map.set(tag, val);
        }
    }
    return map;
}

function convertGpsDms(dms, ref) {
    if (!Array.isArray(dms) || dms.length < 3) return null;
    const dec = dms[0] + dms[1] / 60 + dms[2] / 3600;
    if (!Number.isFinite(dec)) return null;
    const sign = (ref === 'S' || ref === 'W') ? -1 : 1;
    return Number((dec * sign).toFixed(5));
}

function parseTiffExifBlock(view, tiffStart, result) {
    if (tiffStart + 8 > view.byteLength) return;
    const order = String.fromCharCode(view.getUint8(tiffStart), view.getUint8(tiffStart + 1));
    if (order !== 'II' && order !== 'MM') return;
    const littleEndian = order === 'II';
    if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return;

    const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
    const ifd0 = readIfdTagMap(view, tiffStart, firstIfdOffset, littleEndian);
    result.hasExif = true;

    const addTag = (label, value) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            result.tags.push({ label, value: String(value).trim() });
        }
    };

    addTag('Fabricante', ifd0.get(0x010F));
    addTag('Modelo da câmera', ifd0.get(0x0110));
    addTag('Software', ifd0.get(0x0131));
    addTag('Data/Hora (Arquivo)', ifd0.get(0x0132));
    if (ifd0.has(0x0112)) addTag('Orientação EXIF', ifd0.get(0x0112));

    if (ifd0.has(0x8769)) {
        const exifIfd = readIfdTagMap(view, tiffStart, ifd0.get(0x8769), littleEndian);
        addTag('Data da captura', exifIfd.get(0x9003));
        if (exifIfd.has(0x8827)) addTag('ISO', exifIfd.get(0x8827));
        if (exifIfd.has(0x829D)) addTag('Abertura', `f/${Number(exifIfd.get(0x829D)).toFixed(1)}`);
        if (exifIfd.has(0x829A)) {
            const exp = Number(exifIfd.get(0x829A));
            if (exp > 0) addTag('Exposição', exp < 1 ? `1/${Math.round(1 / exp)}s` : `${exp.toFixed(2)}s`);
        }
        if (exifIfd.has(0x920A)) addTag('Distância focal', `${Math.round(Number(exifIfd.get(0x920A)))}mm`);
    }

    if (ifd0.has(0x8825)) {
        const gpsIfd = readIfdTagMap(view, tiffStart, ifd0.get(0x8825), littleEndian);
        const lat = convertGpsDms(gpsIfd.get(0x0002), gpsIfd.get(0x0001));
        const lon = convertGpsDms(gpsIfd.get(0x0004), gpsIfd.get(0x0003));
        if (lat !== null && lon !== null) {
            result.hasGps = true;
            result.gpsCoords = { lat, lon };
            addTag('Localização GPS', `${lat}, ${lon}`);
        } else if (gpsIfd.size > 0) {
            result.hasGps = true;
            addTag('GPS', 'Presente nos cabeçalhos');
        }
    }
}

/**
 * Inspects EXIF/GPS/XMP/comment segments from JPEG or PNG binary buffers
 * without external dependencies so privacy audits work completely offline.
 */
function parseImageMetadata(arrayBuffer, fileMeta = {}) {
    const result = {
        format: fileMeta.type ? fileMeta.type.replace('image/', '').toUpperCase() : 'DESCONHECIDO',
        fileName: fileMeta.name || 'imagem',
        fileSize: fileMeta.size || (arrayBuffer ? arrayBuffer.byteLength : 0),
        width: fileMeta.width || 0,
        height: fileMeta.height || 0,
        hasExif: false,
        hasGps: false,
        gpsCoords: null,
        tags: [],
        chunks: [],
        cleanedByCanvas: false
    };

    if (!arrayBuffer || arrayBuffer.byteLength < 8) return result;
    const view = new DataView(arrayBuffer);

    if (view.getUint16(0, false) === 0xFFD8) {
        result.format = 'JPEG';
        let offset = 2;
        while (offset + 4 <= view.byteLength) {
            const marker = view.getUint16(offset, false);
            if (marker === 0xFFDA || marker === 0xFFD9) break;
            if ((marker & 0xFF00) !== 0xFF00) break;

            const segLength = view.getUint16(offset + 2, false);
            if (segLength < 2 || offset + 2 + segLength > view.byteLength) break;

            if (marker === 0xFFE1 && segLength >= 8) {
                const header = readAscii(view, offset + 4, 6);
                if (header === 'Exif') {
                    parseTiffExifBlock(view, offset + 10, result);
                } else {
                    const xmpSig = readAscii(view, offset + 4, 29);
                    if (xmpSig.includes('adobe.com/xap')) {
                        result.chunks.push('XMP');
                        result.tags.push({ label: 'Metadados XMP', value: 'Bloco XML presente' });
                    }
                }
            } else if (marker === 0xFFFE && segLength > 2) {
                const comment = readAscii(view, offset + 4, Math.min(80, segLength - 2));
                result.chunks.push('COM');
                if (comment) result.tags.push({ label: 'Comentário JPEG', value: comment });
            }

            offset += 2 + segLength;
        }
    } else if (view.getUint32(0, false) === 0x89504E47) {
        result.format = 'PNG';
        let offset = 8;
        while (offset + 12 <= view.byteLength) {
            const chunkLen = view.getUint32(offset, false);
            const chunkType = String.fromCharCode(
                view.getUint8(offset + 4),
                view.getUint8(offset + 5),
                view.getUint8(offset + 6),
                view.getUint8(offset + 7)
            );
            if (chunkType === 'IEND' || offset + 12 + chunkLen > view.byteLength) break;

            if (chunkType === 'tEXt' || chunkType === 'iTXt' || chunkType === 'zTXt') {
                const key = readAscii(view, offset + 8, Math.min(40, chunkLen));
                result.chunks.push(`${chunkType}${key ? ` (${key})` : ''}`);
                result.tags.push({ label: `Chunk PNG (${chunkType})`, value: key || 'Dados de texto' });
            } else if (chunkType === 'eXIf') {
                result.chunks.push('eXIf');
                parseTiffExifBlock(view, offset + 8, result);
            }

            offset += 12 + chunkLen;
        }
    }

    return result;
}

function renderPrivacyMetadataReport() {
    const target = document.getElementById('privacyMetaReport');
    if (!target) return;

    const meta = (typeof lastLoadedMetadata !== 'undefined' && lastLoadedMetadata) ? lastLoadedMetadata : null;
    const width = originalImage ? originalImage.width : (meta ? meta.width : 0);
    const height = originalImage ? originalImage.height : (meta ? meta.height : 0);

    if (!meta || meta.cleanedByCanvas || meta.tags.length === 0) {
        target.innerHTML = `
            <div style="background: rgba(74, 222, 128, 0.1); border: 1px solid #4ade80; color: #4ade80; padding: 0.9rem; border-radius: 10px; margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.4rem 0;">✅ Imagem limpa de metadados sensíveis</h4>
                <p style="font-size: 0.85rem; opacity: 0.9; margin: 0;">
                    Nenhum campo EXIF, GPS ou comentário oculto foi detectado${width ? ` (${width} × ${height} px)` : ''}.
                </p>
            </div>
        `;
        return;
    }

    const rowsHtml = meta.tags
        .map(tag => `<tr><td>${escapeHtml(tag.label)}</td><td>${escapeHtml(tag.value)}</td></tr>`)
        .join('');

    const badgeColor = meta.hasGps ? '#ef4444' : '#fbbf24';
    const badgeBg = meta.hasGps ? 'rgba(239, 68, 68, 0.12)' : 'rgba(251, 191, 36, 0.12)';
    const headline = meta.hasGps
        ? '⚠️ Alerta: Localização GPS e EXIF detectados!'
        : `⚠️ ${meta.tags.length} campo(s) de metadados detectado(s)`;

    target.innerHTML = `
        <div style="background: ${badgeBg}; border: 1px solid ${badgeColor}; color: ${badgeColor}; padding: 0.9rem; border-radius: 10px; margin-bottom: 0.75rem;">
            <h4 style="margin: 0 0 0.35rem 0;">${headline}</h4>
            <p style="font-size: 0.83rem; opacity: 0.92; margin: 0;">
                Formato: ${escapeHtml(meta.format)} · ${width} × ${height} px · ${formatMetaBytes(meta.fileSize)}
            </p>
        </div>
        <div class="meta-report-box" style="margin-bottom: 0.75rem;">
            <table class="meta-report-table"><tbody>${rowsHtml}</tbody></table>
        </div>
    `;
}

function stripMetadataNow() {
    if (!originalImage || !canvas || !ctx) return;

    canvas.width = originalImage.width;
    canvas.height = originalImage.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0);

    if (typeof lastLoadedMetadata !== 'undefined') {
        lastLoadedMetadata = {
            format: 'PNG',
            fileName: 'imagem-limpa.png',
            fileSize: 0,
            width: canvas.width,
            height: canvas.height,
            hasExif: false,
            hasGps: false,
            gpsCoords: null,
            tags: [],
            chunks: [],
            cleanedByCanvas: true
        };
    }

    renderPrivacyMetadataReport();
    if (typeof saveToHistory === 'function') saveToHistory();
    if (typeof showToast === 'function') showToast('Metadados removidos na cópia do Canvas!', 'success');
}

function buildPrivacyControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <div id="privacyMetaReport"></div>

            <button type="button" class="btn-primary" onclick="stripMetadataNow()" style="width: 100%; margin-bottom: 0.5rem;">
                🧹 Limpar Metadados no Canvas
            </button>

            <p style="opacity: 0.78; font-size: 0.86rem;">
                O Canvas do navegador recria os pixels do zero, removendo EXIF, GPS, câmera e blocos XMP/tEXt antes do download.
            </p>
        </div>
    `;

    renderPrivacyMetadataReport();
}

let isColorPickerActive = false;

function buildTechnicalControls(container) {
    container.innerHTML = `
        <div class="control-group">
            <label>Ferramenta</label>
            <div class="radio-group" style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="techTool" value="base64" checked onchange="toggleTechTool(this.value)">
                    <span>Base64</span>
                </label>
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="techTool" value="picker" onchange="toggleTechTool(this.value)">
                    <span>Color Picker</span>
                </label>
            </div>

            <!-- Base64 Area -->
            <div id="base64Section">
                <p style="font-size: 0.9rem; opacity: 0.8; margin-bottom: 0.5rem;">Base64 da imagem (Copie ou Cole aqui):</p>
                <textarea id="base64Output" placeholder="Clique em 'Gerar Base64' para converter a imagem..." style="width: 100%; height: 100px; background: #0f0f13; border: 1px solid var(--border-color); color: var(--text-color); border-radius: 4px; padding: 0.5rem; font-family: monospace; font-size: 0.8rem; resize: vertical;"></textarea>
                
                <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                    <button class="btn-primary" onclick="generateBase64(this)" style="flex: 1; background: var(--accent-color);">
                        🔄 Gerar Base64
                    </button>
                    <button class="btn-secondary" onclick="copyBase64()" style="flex: 1;">
                        📋 Copiar
                    </button>
                    <button class="btn-secondary" onclick="loadBase64Image()" style="flex: 1;">
                        🖼️ Carregar
                    </button>
                </div>
            </div>

            <!-- Color Picker Area -->
            <div id="pickerSection" style="display: none;">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; background: #0f0f13; padding: 0.5rem; border-radius: 8px; border: 1px solid var(--border-color);">
                    <div id="colorPreview" style="width: 40px; height: 40px; border-radius: 4px; background: #000; border: 2px solid #fff;"></div>
                    <div>
                        <div id="hexValue" style="font-family: monospace; font-size: 1.1rem; font-weight: bold;">#000000</div>
                        <div id="rgbValue" style="font-size: 0.8rem; opacity: 0.7;">rgb(0, 0, 0)</div>
                    </div>
                </div>
                <p style="font-size: 0.9rem; color: #4ade80;">
                    👆 Passe o mouse sobre a imagem para ver a cor. Clique para copiar o HEX.
                </p>
                <p id="copyFeedback" style="font-size: 0.8rem; color: #4ade80; opacity: 0; transition: opacity 0.3s;">
                    Copiado para a área de transferência!
                </p>
            </div>
        </div>
    `;

    setupColorPickerEvents();
}

function generateBase64(btn) {
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Gerando...';
    btn.disabled = true;

    setTimeout(() => {
        try {
            const dataURL = canvas.toDataURL('image/png');
            document.getElementById('base64Output').value = dataURL;
        } catch (e) {
            console.error("Erro ao gerar base64", e);
            if (typeof showToast === 'function') showToast('Erro ao gerar Base64.', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }, 50);
}

function toggleTechTool(mode) {
    const base64Sec = document.getElementById('base64Section');
    const pickerSec = document.getElementById('pickerSection');

    if (mode === 'base64') {
        base64Sec.style.display = 'block';
        pickerSec.style.display = 'none';
        isColorPickerActive = false;
        canvas.style.cursor = 'default';
    } else {
        base64Sec.style.display = 'none';
        pickerSec.style.display = 'block';
        isColorPickerActive = true;
        canvas.style.cursor = 'crosshair';
    }
}

function copyBase64() {
    const textarea = document.getElementById('base64Output');
    if (!textarea || !textarea.value) {
        if (typeof showToast === 'function') showToast('Gere ou cole um Base64 primeiro.', 'error');
        return;
    }
    if (typeof copyTextToClipboard === 'function') {
        copyTextToClipboard(textarea.value, 'Base64 copiado!');
    }
    const copyBtn = document.querySelector('button[onclick="copyBase64()"]');
    if (copyBtn) {
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '✅ Copiado!';
        setTimeout(() => {
            if (copyBtn.isConnected) copyBtn.innerHTML = originalText;
        }, 2000);
    }
}

function loadBase64Image() {
    const textarea = document.getElementById('base64Output');
    const base64Str = textarea.value.trim();

    if (!base64Str) {
        if (typeof showToast === 'function') showToast('Cole uma string Base64 válida primeiro.', 'error');
        return;
    }

    const img = new Image();
    img.onload = () => {
        initialLoadedImage = img;
        originalImage = img;
        trueOriginalImage = img;

        if (typeof refreshLoadedMetadata === 'function') {
            refreshLoadedMetadata(base64Str, {
                name: 'base64-image',
                size: 0,
                type: '',
                width: img.width,
                height: img.height
            });
        }

        if (typeof resetCollage === 'function') resetCollage();

        displayImage(img);
        if (typeof initHistory === 'function') initHistory();
        if (typeof showToast === 'function') showToast('Imagem carregada com sucesso!', 'success');
    };
    img.onerror = () => {
        if (typeof showToast === 'function') {
            showToast('Base64 inválido. Use o formato data:image/...;base64,...', 'error');
        }
    };
    img.src = base64Str;
}

function setupColorPickerEvents() {
    canvas.onmousemove = (e) => {
        if (!isColorPickerActive) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);

        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const r = pixel[0];
        const g = pixel[1];
        const b = pixel[2];
        const hex = rgbToHex(r, g, b);

        document.getElementById('colorPreview').style.backgroundColor = hex;
        document.getElementById('hexValue').textContent = hex.toUpperCase();
        document.getElementById('rgbValue').textContent = `rgb(${r}, ${g}, ${b})`;
    };

    canvas.onclick = () => {
        if (!isColorPickerActive) return;

        const hex = document.getElementById('hexValue').textContent;
        if (typeof copyTextToClipboard === 'function') {
            copyTextToClipboard(hex, `Cor ${hex} copiada!`);
        }
        const feedback = document.getElementById('copyFeedback');
        if (feedback) {
            feedback.style.opacity = '1';
            setTimeout(() => {
                if (feedback.isConnected) feedback.style.opacity = '0';
            }, 2000);
        }
    };
}

function rgbToHex(r, g, b) {
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    return '#' + [clamp(r), clamp(g), clamp(b)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
}

function openBase64Modal() {
    const modal = document.getElementById('base64Modal');
    modal.style.display = 'flex';
}

function closeBase64Modal() {
    const modal = document.getElementById('base64Modal');
    modal.style.display = 'none';
}

function loadBase64FromModal() {
    const textarea = document.getElementById('base64InputModal');
    const base64Str = textarea.value.trim();

    if (!base64Str) {
        if (typeof showToast === 'function') showToast('Cole uma string Base64 válida.', 'error');
        return;
    }

    const img = new Image();
    img.onload = () => {
        initialLoadedImage = img;
        originalImage = img;
        trueOriginalImage = img;

        if (typeof refreshLoadedMetadata === 'function') {
            refreshLoadedMetadata(base64Str, {
                name: 'base64-image',
                size: 0,
                type: '',
                width: img.width,
                height: img.height
            });
        }

        if (typeof resetCollage === 'function') resetCollage();

        displayImage(img);
        showEditor();
        if (typeof initHistory === 'function') initHistory();
        buildControls();
        closeBase64Modal();

        textarea.value = '';
    };
    img.onerror = () => {
        if (typeof showToast === 'function') showToast('Erro ao carregar imagem. Verifique se o código Base64 é válido.', 'error');
    };
    img.src = base64Str;
}

window.addEventListener('click', (event) => {
    const modal = document.getElementById('base64Modal');
    if (modal && event.target === modal) {
        closeBase64Modal();
    }
});

function cleanupPhase4Tools() {
    isColorPickerActive = false;
    if (canvas) canvas.style.cursor = 'default';
}
