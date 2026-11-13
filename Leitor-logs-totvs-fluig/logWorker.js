const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB por bloco para evitar picos de RAM
const LOG_LINE_REGEX = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}[.,]\d{3})\s+((?:INFO|WARN|ERROR|DEBUG|FATAL|TRACE|SEVERE|WARNING)(?:x\d+)?)\s+(\[.*?\])\s+(\(.*?\))\s+(.*)$/i;
const CONFIG_END_REGEX = /^={10,}$/;
const CONFIG_START_MARKER = '=============LOG CONFIGS=========';
const MAX_INTERN_KEYS = 10000;

function parseLogTimestampMs(dateStr) {
    if (!dateStr || dateStr.length < 19) return 0;
    const y = Number(dateStr.slice(0, 4));
    const m = Number(dateStr.slice(5, 7));
    const d = Number(dateStr.slice(8, 10));
    const hh = Number(dateStr.slice(11, 13));
    const mm = Number(dateStr.slice(14, 16));
    const ss = Number(dateStr.slice(17, 19));
    const ms = dateStr.length >= 23 ? Number(dateStr.slice(20, 23)) : 0;
    const ts = Date.UTC(y, m - 1, d, hh, mm, ss, ms);
    return Number.isFinite(ts) ? ts : 0;
}

function parseTimeSeconds(dateStr) {
    if (!dateStr || dateStr.length < 19) return -1;
    const hh = Number(dateStr.slice(11, 13));
    const mm = Number(dateStr.slice(14, 16));
    const ss = Number(dateStr.slice(17, 19));
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) return -1;
    return hh * 3600 + mm * 60 + ss;
}

function normalizeLogLevel(rawLevel) {
    const multMatch = rawLevel.match(/x(\d+)$/i);
    const repeatCount = multMatch ? Math.max(1, parseInt(multMatch[1], 10)) : 1;
    const base = rawLevel.replace(/x\d+$/i, '').trim().toUpperCase();
    let level = base;
    if (base === 'SEVERE') level = 'ERROR';
    else if (base === 'WARNING') level = 'WARN';
    return { level, repeatCount };
}

function internString(pool, value) {
    const existing = pool.get(value);
    if (existing !== undefined) return existing;
    if (pool.size < MAX_INTERN_KEYS) {
        pool.set(value, value);
    }
    return value;
}

function sameStacktrace(arrA, arrB) {
    const lenA = arrA ? arrA.length : 0;
    const lenB = arrB ? arrB.length : 0;
    if (lenA !== lenB) return false;
    for (let i = 0; i < lenA; i++) {
        if (arrA[i] !== arrB[i]) return false;
    }
    return true;
}

function createLogParser(multiFileMode) {
    const allLogs = [];
    const classPool = new Map();
    const threadPool = new Map();

    let lastLog = null;
    let pendingHeader = null;
    let pendingBuffer = [];
    let configBuffer = [];
    let inConfigBlock = false;
    let currentFileName = '';

    let countTotal = 0;
    let countError = 0;
    let countWarn = 0;
    let countInfo = 0;
    let countDebug = 0;
    let countTrace = 0;
    let processedLines = 0;
    let oldestDate = null;
    let newestDate = null;
    let previousUniqueLogDate = null;

    function flushConfigBlock() {
        if (configBuffer.length === 0) return;
        const entry = {
            type: 'stacktrace_only',
            isConfigMode: true,
            stacktrace: configBuffer,
            label: 'Show Configs'
        };
        if (multiFileMode && currentFileName) entry.fileName = currentFileName;
        allLogs.push(entry);
        configBuffer = [];
    }

    function processPendingLog() {
        if (!pendingHeader) return;

        const { date, level, repeatCount, className, thread, message, fileName } = pendingHeader;
        countTotal += repeatCount;

        if (level === 'ERROR' || level === 'FATAL') countError += repeatCount;
        else if (level === 'WARN') countWarn += repeatCount;
        else if (level === 'INFO') countInfo += repeatCount;
        else if (level === 'DEBUG') countDebug += repeatCount;
        else if (level === 'TRACE') countTrace += repeatCount;

        const cleanClass = internString(classPool, className.replace(/^\[|\]$/g, ''));
        const cleanThread = internString(threadPool, thread.replace(/^\(|\)$/g, ''));
        const cleanMessage = message.replace(/^-\s+/, '');

        const timestamp = parseLogTimestampMs(date);
        const timeSecs = parseTimeSeconds(date);
        if (timestamp > 0) {
            if (oldestDate === null || timestamp < oldestDate) oldestDate = timestamp;
            if (newestDate === null || timestamp > newestDate) newestDate = timestamp;
        }

        const isSameAsLast =
            lastLog &&
            lastLog.type === 'log' &&
            lastLog.date === date &&
            lastLog.level === level &&
            lastLog.className === cleanClass &&
            lastLog.thread === cleanThread &&
            lastLog.message === cleanMessage &&
            (!multiFileMode || lastLog.fileName === fileName) &&
            sameStacktrace(lastLog.stacktrace, pendingBuffer);

        if (isSameAsLast) {
            lastLog.count += repeatCount;
        } else {
            let deltaMs = 0;
            if (previousUniqueLogDate && timestamp > 0) {
                const diff = timestamp - previousUniqueLogDate;
                if (diff > 0) deltaMs = diff;
            }
            if (timestamp > 0) previousUniqueLogDate = timestamp;

            const isConfig = cleanMessage.includes(CONFIG_START_MARKER);
            const logEntry = {
                type: isConfig ? 'config' : 'log',
                date,
                timestamp,
                timeSecs,
                deltaMs,
                level,
                className: cleanClass,
                thread: cleanThread,
                message: cleanMessage,
                count: repeatCount,
                stacktrace: pendingBuffer.length > 0 ? [...pendingBuffer] : null,
                isConfigMode: isConfig
            };
            if (multiFileMode && fileName) {
                logEntry.fileName = fileName;
            }

            allLogs.push(logEntry);
            lastLog = logEntry;
        }

        pendingBuffer = [];
        pendingHeader = null;
    }

    function setActiveFile(fileName) {
        if (inConfigBlock) {
            flushConfigBlock();
            inConfigBlock = false;
        }
        processPendingLog();
        lastLog = null;
        currentFileName = fileName || '';
    }

    function processLine(rawLine) {
        processedLines++;
        let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        if (line.charCodeAt(0) === 0xFEFF) line = line.slice(1);
        const match = line.match(LOG_LINE_REGEX);

        if (match) {
            const [, date, rawLevel, className, thread, message] = match;
            const { level, repeatCount } = normalizeLogLevel(rawLevel);

            if (message.includes(CONFIG_START_MARKER)) {
                if (inConfigBlock) flushConfigBlock();
                inConfigBlock = true;
                processPendingLog();
                pendingHeader = {
                    date,
                    level,
                    repeatCount,
                    className,
                    thread,
                    message,
                    fileName: currentFileName
                };
                pendingBuffer = [];
                processPendingLog();
                return;
            }

            if (inConfigBlock && CONFIG_END_REGEX.test(message)) {
                configBuffer.push(line);
                flushConfigBlock();
                inConfigBlock = false;
                return;
            }

            if (inConfigBlock) {
                configBuffer.push(line);
            } else {
                processPendingLog();
                pendingHeader = {
                    date,
                    level,
                    repeatCount,
                    className,
                    thread,
                    message,
                    fileName: currentFileName
                };
                pendingBuffer = [];
            }
            return;
        }

        if (line.includes(CONFIG_START_MARKER)) {
            if (inConfigBlock) flushConfigBlock();
            inConfigBlock = true;
            const rawEntry = { type: 'raw', content: line, isBold: true };
            if (multiFileMode && currentFileName) rawEntry.fileName = currentFileName;
            allLogs.push(rawEntry);
            return;
        }

        if (inConfigBlock && line.trim() === '============') {
            configBuffer.push(line);
            flushConfigBlock();
            inConfigBlock = false;
            return;
        }

        if (inConfigBlock) {
            configBuffer.push(line);
        } else if (pendingHeader) {
            if (line.trim().length > 0) {
                pendingBuffer.push(line);
            }
        } else if (line.trim().length > 0) {
            const rawEntry = { type: 'raw', content: line };
            if (multiFileMode && currentFileName) rawEntry.fileName = currentFileName;
            allLogs.push(rawEntry);
            lastLog = null;
        }
    }

    function finish() {
        if (inConfigBlock) {
            flushConfigBlock();
            inConfigBlock = false;
        }
        processPendingLog();
        allLogs.reverse();

        return {
            logs: allLogs,
            stats: {
                total: countTotal,
                errors: countError,
                warnings: countWarn,
                infos: countInfo,
                debugs: countDebug,
                traces: countTrace,
                processedLines,
                uniqueEntries: allLogs.length,
                oldestDate: oldestDate || 0,
                newestDate: newestDate || 0,
                durationMs: (oldestDate !== null && newestDate !== null && newestDate >= oldestDate)
                    ? (newestDate - oldestDate)
                    : 0
            }
        };
    }

    return {
        setActiveFile,
        processLine,
        finish,
        getProcessedLines: () => processedLines,
        getUniqueCount: () => allLogs.length
    };
}

function feedTextBuffer(parser, text, flushAll) {
    let start = 0;
    let newlineIndex;
    while ((newlineIndex = text.indexOf('\n', start)) !== -1) {
        parser.processLine(text.slice(start, newlineIndex));
        start = newlineIndex + 1;
    }
    if (flushAll) {
        if (start < text.length) {
            parser.processLine(text.slice(start));
        }
        return '';
    }
    return text.slice(start);
}

self.addEventListener('message', async function (e) {
    try {
        const payload = e.data || {};
        const files = Array.isArray(payload.files) ? payload.files : null;

        if (files && files.length > 0) {
            const parser = createLogParser(files.length > 1);
            const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
            let processedBytesGlobal = 0;
            let lastReportTime = 0;

            for (let idx = 0; idx < files.length; idx++) {
                const file = files[idx];
                const fileSize = file.size || 0;
                parser.setActiveFile(file.name || `arquivo-${idx + 1}.log`);

                const decoder = new TextDecoder('utf-8', { fatal: false });
                let carry = '';
                let offset = 0;

                while (offset < fileSize) {
                    const end = Math.min(offset + CHUNK_SIZE, fileSize);
                    const slice = file.slice(offset, end);
                    const buffer = typeof slice.arrayBuffer === 'function'
                        ? await slice.arrayBuffer()
                        : await new Response(slice).arrayBuffer();

                    const isLastChunk = end >= fileSize;
                    const decoded = decoder.decode(buffer, { stream: !isLastChunk });
                    carry = feedTextBuffer(parser, carry + decoded, false);

                    processedBytesGlobal += (end - offset);
                    offset = end;

                    const now = Date.now();
                    if (now - lastReportTime >= 90 || isLastChunk) {
                        lastReportTime = now;
                        const progress = totalBytes > 0
                            ? Math.min(99, Math.round((processedBytesGlobal / totalBytes) * 100))
                            : 100;
                        self.postMessage({
                            status: 'progress',
                            progress,
                            processedBytes: processedBytesGlobal,
                            totalBytes,
                            processedLines: parser.getProcessedLines(),
                            uniqueEntries: parser.getUniqueCount(),
                            fileName: file.name || '',
                            fileIndex: idx + 1,
                            fileCount: files.length
                        });
                    }
                }

                const remaining = decoder.decode();
                if (carry.length > 0 || remaining.length > 0) {
                    feedTextBuffer(parser, carry + remaining, true);
                }
            }

            const data = parser.finish();
            self.postMessage({ status: 'done', data });
            return;
        }

        const content = typeof payload.content === 'string' ? payload.content : '';
        const parser = createLogParser(false);
        feedTextBuffer(parser, content, true);
        const data = parser.finish();
        self.postMessage({ status: 'done', data });
    } catch (err) {
        self.postMessage({
            status: 'error',
            message: err?.message || 'Erro inesperado ao processar o log.'
        });
    }
});
