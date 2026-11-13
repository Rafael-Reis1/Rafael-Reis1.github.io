(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.P2PCore = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CHUNK_SIZE = 65536; // 64 KB
    const MAX_BUFFERED_AMOUNT = 1024 * 1024; // 1 MB
    const TRANSFER_ID_LENGTH = 8;
    const PACKET_TYPE = Object.freeze({
        CONTROL: 0,
        CHUNK: 1,
        CANCEL: 2
    });

    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();
    const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

    /**
     * Generates a fixed-length 8-character lowercase alphanumeric transfer ID.
     * Guaranteed 8-byte UTF-8 representation for binary packet framing.
     * @returns {string}
     */
    function generateTransferId() {
        const chars = new Array(TRANSFER_ID_LENGTH);
        const cryptoObj = typeof globalThis !== 'undefined' && globalThis.crypto;
        if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
            const randomBytes = new Uint8Array(TRANSFER_ID_LENGTH);
            cryptoObj.getRandomValues(randomBytes);
            for (let i = 0; i < TRANSFER_ID_LENGTH; i++) {
                chars[i] = ID_ALPHABET[randomBytes[i] % ID_ALPHABET.length];
            }
        } else {
            for (let i = 0; i < TRANSFER_ID_LENGTH; i++) {
                chars[i] = ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
            }
        }
        return chars.join('');
    }

    /**
     * Normalizes incoming binary payloads (Uint8Array, ArrayBuffer, or ArrayBufferView)
     * into a Uint8Array without copying when possible.
     * @param {Uint8Array|ArrayBuffer|ArrayBufferView} data
     * @returns {Uint8Array}
     */
    function toUint8Array(data) {
        if (data instanceof Uint8Array) return data;
        if (data instanceof ArrayBuffer) return new Uint8Array(data);
        if (ArrayBuffer.isView(data)) {
            return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        }
        throw new TypeError('Unsupported binary packet type');
    }

    /**
     * Normalizes a transfer ID string into exactly TRANSFER_ID_LENGTH ASCII bytes.
     * @param {string} transferId
     * @returns {Uint8Array}
     */
    function encodeTransferIdBytes(transferId) {
        const clean = String(transferId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const padded = clean.padEnd(TRANSFER_ID_LENGTH, '0').slice(0, TRANSFER_ID_LENGTH);
        return textEncoder.encode(padded);
    }

    /**
     * Encodes a JSON control payload into a type-0 packet: [0x00, ...utf8Json].
     * @param {Object} payload
     * @returns {Uint8Array}
     */
    function encodeControlPacket(payload) {
        const jsonBytes = textEncoder.encode(JSON.stringify(payload));
        const packet = new Uint8Array(1 + jsonBytes.length);
        packet[0] = PACKET_TYPE.CONTROL;
        packet.set(jsonBytes, 1);
        return packet;
    }

    /**
     * Encodes a file data chunk into a type-1 packet: [0x01, ...8-byte transferId, ...chunkBytes].
     * @param {string} transferId
     * @param {Uint8Array|ArrayBuffer|ArrayBufferView} chunkData
     * @returns {Uint8Array}
     */
    function encodeChunkPacket(transferId, chunkData) {
        const idBytes = encodeTransferIdBytes(transferId);
        const chunkBytes = toUint8Array(chunkData);
        const packet = new Uint8Array(1 + TRANSFER_ID_LENGTH + chunkBytes.length);
        packet[0] = PACKET_TYPE.CHUNK;
        packet.set(idBytes, 1);
        packet.set(chunkBytes, 1 + TRANSFER_ID_LENGTH);
        return packet;
    }

    /**
     * Encodes a transfer cancel notification into a type-2 packet: [0x02, ...8-byte transferId].
     * @param {string} transferId
     * @returns {Uint8Array}
     */
    function encodeCancelPacket(transferId) {
        const idBytes = encodeTransferIdBytes(transferId);
        const packet = new Uint8Array(1 + TRANSFER_ID_LENGTH);
        packet[0] = PACKET_TYPE.CANCEL;
        packet.set(idBytes, 1);
        return packet;
    }

    /**
     * Decodes a raw incoming binary WebRTC packet.
     * @param {Uint8Array|ArrayBuffer|ArrayBufferView} rawData
     * @returns {{type: number, json?: Object, transferId?: string, chunkBytes?: Uint8Array, error?: Error}}
     */
    function decodePacket(rawData) {
        let bytes;
        try {
            bytes = toUint8Array(rawData);
        } catch (error) {
            return { type: -1, error };
        }

        if (bytes.length === 0) {
            return { type: -1, error: new Error('Empty packet') };
        }

        const type = bytes[0];
        if (type === PACKET_TYPE.CONTROL) {
            try {
                const jsonStr = textDecoder.decode(bytes.subarray(1));
                const json = JSON.parse(jsonStr);
                return { type, json };
            } catch (error) {
                return { type: -1, error };
            }
        }

        if (type === PACKET_TYPE.CHUNK) {
            if (bytes.length < 1 + TRANSFER_ID_LENGTH) {
                return { type: -1, error: new Error('Truncated chunk packet header') };
            }
            const transferId = textDecoder.decode(bytes.subarray(1, 1 + TRANSFER_ID_LENGTH));
            const chunkBytes = bytes.subarray(1 + TRANSFER_ID_LENGTH);
            return { type, transferId, chunkBytes };
        }

        if (type === PACKET_TYPE.CANCEL) {
            if (bytes.length < 1 + TRANSFER_ID_LENGTH) {
                return { type: -1, error: new Error('Truncated cancel packet header') };
            }
            const transferId = textDecoder.decode(bytes.subarray(1, 1 + TRANSFER_ID_LENGTH));
            return { type, transferId };
        }

        return { type: -1, error: new Error(`Unknown packet type: ${type}`) };
    }

    /**
     * Sanitizes a room identifier to valid URL/Firebase-safe characters ([a-zA-Z0-9_-]).
     * Prevents DOM XSS and Firebase RTDB illegal path character exceptions.
     * @param {string} raw
     * @returns {string}
     */
    function sanitizeRoomId(raw) {
        if (typeof raw !== 'string') return '';
        return raw.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    }

    /**
     * Parses a manual room input which may be a full invite/OBS URL, query fragment, or plain ID.
     * Never throws on invalid URLs.
     * @param {string} rawInput
     * @returns {string}
     */
    function parseRoomInput(rawInput) {
        if (typeof rawInput !== 'string') return '';
        const trimmed = rawInput.trim();
        if (!trimmed) return '';

        if (/^https?:\/\//i.test(trimmed) || trimmed.includes('?')) {
            try {
                const parsed = trimmed.startsWith('?')
                    ? new URL(`https://local.invalid/${trimmed}`)
                    : new URL(trimmed, 'https://local.invalid');
                const remote = parsed.searchParams.get('remote');
                if (remote) return sanitizeRoomId(remote);
                const hostId = parsed.searchParams.get('host_id');
                if (hostId) return sanitizeRoomId(hostId);
            } catch (_) {
                // Fall through to query/key matching
            }
        }

        const paramMatch = trimmed.match(/(?:^|[?&#])(?:remote|host_id)=([^&#\s]+)/i);
        if (paramMatch && paramMatch[1]) {
            try {
                return sanitizeRoomId(decodeURIComponent(paramMatch[1]));
            } catch (_) {
                return sanitizeRoomId(paramMatch[1]);
            }
        }

        return sanitizeRoomId(trimmed);
    }

    /**
     * Sanitizes an untrusted remote filename before displaying or triggering a download.
     * Strips control characters and path separators; UI code must still render via textContent.
     * @param {string} name
     * @param {string} [fallback='arquivo']
     * @returns {string}
     */
    function sanitizeFileName(name, fallback = 'arquivo') {
        if (typeof name !== 'string') return fallback;
        const cleaned = name
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .replace(/[\\/]+/g, '_')
            .trim()
            .slice(0, 240);
        return cleaned || fallback;
    }

    /**
     * Formats byte counts into a compact human-readable string.
     * @param {number} bytes
     * @param {number} [decimals=2]
     * @returns {string}
     */
    function formatBytes(bytes, decimals = 2) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    /**
     * Formats transfer throughput given bytes moved and elapsed milliseconds.
     * @param {number} bytesTransferred
     * @param {number} elapsedMs
     * @returns {{text: string, bytesPerSec: number}}
     */
    function formatSpeed(bytesTransferred, elapsedMs) {
        if (!Number.isFinite(bytesTransferred) || !Number.isFinite(elapsedMs) || elapsedMs <= 0 || bytesTransferred <= 0) {
            return { text: '', bytesPerSec: 0 };
        }
        const bytesPerSec = bytesTransferred / (elapsedMs / 1000);
        const mbPerSec = bytesPerSec / (1024 * 1024);
        if (mbPerSec >= 0.1) {
            return { text: `${mbPerSec.toFixed(1)} MB/s`, bytesPerSec };
        }
        const kbPerSec = bytesPerSec / 1024;
        return { text: `${kbPerSec.toFixed(0)} KB/s`, bytesPerSec };
    }

    /**
     * Formats estimated time remaining for a file transfer.
     * @param {number} remainingBytes
     * @param {number} bytesPerSec
     * @returns {string}
     */
    function formatEta(remainingBytes, bytesPerSec) {
        if (!Number.isFinite(remainingBytes) || remainingBytes <= 0 || !Number.isFinite(bytesPerSec) || bytesPerSec <= 0) {
            return '';
        }
        const totalSeconds = Math.ceil(remainingBytes / bytesPerSec);
        if (totalSeconds < 60) return `~${totalSeconds}s`;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return seconds > 0 ? `~${minutes}m ${seconds}s` : `~${minutes}m`;
    }

    return {
        CHUNK_SIZE,
        MAX_BUFFERED_AMOUNT,
        TRANSFER_ID_LENGTH,
        PACKET_TYPE,
        generateTransferId,
        toUint8Array,
        encodeControlPacket,
        encodeChunkPacket,
        encodeCancelPacket,
        decodePacket,
        sanitizeRoomId,
        parseRoomInput,
        sanitizeFileName,
        formatBytes,
        formatSpeed,
        formatEta
    };
});
