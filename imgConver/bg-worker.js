import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/+esm';
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
ort.env.wasm.numThreads = 1;

import { removeBackground } from 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';

self.onmessage = async (e) => {
    const { id, blob } = e.data;
    
    try {
        const resultBlob = await removeBackground(blob, {
            progress: (key, current, total) => {
                self.postMessage({ id, type: 'progress', key, current, total });
            }
        });
        
        self.postMessage({ id, type: 'success', resultBlob });
    } catch (error) {
        self.postMessage({ id, type: 'error', error: error.toString() });
    }
};
