/**
 * Configuração e Inicialização dos Serviços Firebase
 */

const firebaseConfig = {
    apiKey: "AIzaSyCvI-ATmTj-zAzbGnKLx1Fq7i29KoULwro",
    authDomain: "finance-app-e50b8.firebaseapp.com",
    projectId: "finance-app-e50b8",
    storageBucket: "finance-app-e50b8.firebasestorage.app",
    messagingSenderId: "339147531228",
    appId: "1:339147531228:web:6eb3aca1de8798e6d52519",
    measurementId: "G-ZHX9XRD3TK"
};

const fb = (typeof window !== 'undefined' && window.firebase) ? window.firebase : (typeof firebase !== 'undefined' ? firebase : null);

try {
    if (fb && (!fb.apps || !fb.apps.length)) {
        fb.initializeApp(firebaseConfig);
    }
} catch (e) {
    console.error('Firebase Init Error', e);
}

export const auth = fb ? fb.auth() : null;
export const db = fb ? fb.firestore() : null;
export const googleProvider = fb ? new fb.auth.GoogleAuthProvider() : null;

if (typeof window !== 'undefined' && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    console.log("🛠️ MODO DEV: Conectando aos Emuladores Locais...");
    if (auth) auth.useEmulator("http://localhost:9099");
    if (db) db.useEmulator("localhost", 8080);
}

if (db && typeof db.enablePersistence === 'function') {
    db.enablePersistence({ synchronizeTabs: true })
        .catch((err) => {
            if (err.code == 'unimplemented') {
                console.log('Persistência offline não suportada neste navegador.');
            } else if (err.code == 'failed-precondition') {
                console.log('Persistência offline falhou: Múltiplas abas abertas.');
            }
        });
}

export { fb as firebase };

