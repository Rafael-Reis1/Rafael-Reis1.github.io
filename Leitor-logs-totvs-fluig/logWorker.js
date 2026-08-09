self.addEventListener('message', function(e) {
    const { content } = e.data;
    const lines = content.split('\n');

    let allLogs = [];
    
    let lastLog = null;
    let pendingHeader = null;
    let pendingBuffer = [];
    let countTotal = 0;
    let countError = 0;
    let countWarn = 0;
    let oldestDate = null;
    let newestDate = null;
    let previousUniqueLogDate = null;

    function parseLogDate(dateStr) {
        const isoStr = dateStr.replace(' ', 'T').replace(',', '.');
        return new Date(isoStr).getTime();
    }

    function processPendingLog() {
        if (!pendingHeader) return;

        countTotal++;
        let { date, level, className, thread, message } = pendingHeader;

        className = className.replace(/^\[|\]$/g, '');
        thread = thread.replace(/^\(|\)$/g, '');
        message = message.replace(/^-\s+/, '');

        if (level === 'ERROR') countError++;
        if (level === 'WARN') countWarn++;

        const timestamp = parseLogDate(date);
        if (!oldestDate) oldestDate = timestamp;
        newestDate = timestamp;

        const bufferContent = pendingBuffer.join('\n');
        const signature = `${date}|${level}|${className}|${thread}|${message}|${bufferContent}`;

        if (lastLog && lastLog.signature === signature) {
            lastLog.count++;
        } else {
            let deltaMs = 0;
            if (previousUniqueLogDate) {
                const diff = timestamp - previousUniqueLogDate;
                if (diff > 0) {
                    deltaMs = diff;
                }
            }
            previousUniqueLogDate = timestamp;

            const isConfig = message.includes('=============LOG CONFIGS=========');

            const logEntry = {
                type: isConfig ? 'config' : 'log',
                date: date,
                timestamp: timestamp,
                deltaMs: deltaMs,
                level: level,
                className: className,
                thread: thread,
                message: message,
                signature: signature,
                count: 1,
                stacktrace: [...pendingBuffer],
                isConfigMode: isConfig
            };

            allLogs.push(logEntry);
            lastLog = logEntry;
        }
        pendingBuffer = [];
    }

    let configBuffer = [];
    let inConfigBlock = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].replace('\r', '');
        
        const regex = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2},\d{3})\s+((?:INFO|WARN|ERROR|DEBUG|FATAL)(?:x\d+)?)\s+(\[.*?\])\s+(\(.*?\))\s+(.*)$/;
        const match = line.match(regex);

        if (match) {
            const [fullMatch, date, rawLevel, className, thread, message] = match;
            const level = rawLevel.replace(/x\d+$/, '').trim();

            if (message.includes('=============LOG CONFIGS=========')) {
                if (inConfigBlock && configBuffer.length > 0) {
                    allLogs.push({ type: 'stacktrace_only', isConfigMode: true, stacktrace: configBuffer, label: 'Show Configs' });
                    configBuffer = [];
                }
                inConfigBlock = true;
                processPendingLog();

                pendingHeader = { date, level, className, thread, message };
                pendingBuffer = [];

                processPendingLog();
                pendingHeader = null;

                continue;
            }

            if (inConfigBlock && message.match(/^={10,}$/)) {
                configBuffer.push(line);
                allLogs.push({ type: 'stacktrace_only', isConfigMode: true, stacktrace: configBuffer, label: 'Show Configs' });
                configBuffer = [];
                inConfigBlock = false;
                continue;
            }

            if (inConfigBlock) {
                configBuffer.push(line);
            } else {
                processPendingLog();
                pendingHeader = { date, level, className, thread, message };
                pendingBuffer = [];
            }
        } else {
            if (line.includes('=============LOG CONFIGS=========')) {
                if (inConfigBlock && configBuffer.length > 0) {
                    allLogs.push({ type: 'stacktrace_only', isConfigMode: true, stacktrace: configBuffer, label: 'Show Configs' });
                    configBuffer = [];
                }
                inConfigBlock = true;
                allLogs.push({ type: 'raw', content: line, isBold: true });
                continue;
            }

            if (inConfigBlock && line.trim() === '============') {
                configBuffer.push(line);
                allLogs.push({ type: 'stacktrace_only', isConfigMode: true, stacktrace: configBuffer, label: 'Show Configs' });
                configBuffer = [];
                inConfigBlock = false;
                continue;
            }

            if (inConfigBlock) {
                configBuffer.push(line);
            } else {
                if (pendingHeader) {
                    if (line.trim().length > 0) {
                        pendingBuffer.push(line);
                    }
                } else {
                    if (line.trim().length > 0) {
                        allLogs.push({ type: 'raw', content: line });
                        lastLog = null;
                    }
                }
            }
        }
    }

    if (inConfigBlock && configBuffer.length > 0) {
        allLogs.push({ type: 'stacktrace_only', isConfigMode: true, stacktrace: configBuffer, label: 'Show Configs' });
    }
    processPendingLog();

    self.postMessage({
        status: 'done',
        data: {
            logs: allLogs.reverse(),
            stats: {
                total: countTotal,
                errors: countError,
                warnings: countWarn,
                durationMs: (oldestDate && newestDate) ? (newestDate - oldestDate) : 0
            }
        }
    });
});
