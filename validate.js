const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IGNORED_DIRS = new Set(['node_modules', '.git', '.gemini', 'assets', 'vendor', '.npm-cache']);
const TEXT_EXTS = new Set(['.html', '.css', '.js', '.mjs', '.json']);
const jsFiles = [];
const textFiles = [];

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
            continue;
        }
        const relative = path.relative(process.cwd(), path.join(dir, entry.name));
        if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
            jsFiles.push(relative);
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (TEXT_EXTS.has(ext) && !entry.name.endsWith('.min.js')) {
            textFiles.push(relative);
        }
    }
}

console.log('\n🔍 Verificando sintaxe de todos os arquivos JavaScript...\n');

const startTime = Date.now();
walk(process.cwd());

if (jsFiles.length === 0) {
    console.log('ℹ️  Nenhum arquivo JavaScript encontrado para validar.\n');
    process.exit(0);
}

const failures = [];

for (const file of jsFiles) {
    // `stdio: inherit` evita depender de pipes (funciona também em ambientes restritos).
    const result = spawnSync(process.execPath, ['--check', file], {
        stdio: ['ignore', 'ignore', 'inherit']
    });

    if (result.status !== 0) {
        failures.push(file);
    }
}

const elapsed = Date.now() - startTime;

if (failures.length === 0) {
    console.log(`✨ Sucesso! ${jsFiles.length} arquivos validados em ${elapsed}ms.`);
    console.log('🎉 Nenhum erro de sintaxe encontrado no repositório.\n');
} else {
    console.error(`\n❌ ${failures.length} arquivo(s) com erro de sintaxe:`);
    failures.forEach((file) => console.error(`   - ${file}`));
    console.error('');
    process.exit(1);
}

// Marcadores de conflito de merge esquecidos quebram HTML/CSS de forma silenciosa:
// o texto aparece na página e um <script> inline vira SyntaxError no console.
const conflictPattern = /^(?:<{7}(?:[ \t]|$)|={7}[ \t]*$|>{7}(?:[ \t]|$))/m;
const conflicted = [];

for (const file of textFiles) {
    if (conflictPattern.test(fs.readFileSync(path.join(process.cwd(), file), 'utf8'))) {
        conflicted.push(file);
    }
}

if (conflicted.length > 0) {
    console.error(`\n❌ Marcadores de conflito de merge encontrados em ${conflicted.length} arquivo(s):`);
    conflicted.forEach((file) => console.error(`   - ${file}`));
    console.error('   Resolva os marcadores (<<<<<<<, =======, >>>>>>>) antes de publicar.\n');
    process.exit(1);
}

console.log(`🔎 ${textFiles.length} arquivos de texto verificados: nenhum marcador de conflito encontrado.\n`);
process.exit(0);
