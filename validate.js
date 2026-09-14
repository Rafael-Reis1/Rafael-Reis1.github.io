const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IGNORED_DIRS = new Set(['node_modules', '.git', '.gemini', 'assets', 'vendor']);
let jsFiles = [];

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
            continue;
        }
        if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
            jsFiles.push(path.relative(process.cwd(), path.join(dir, entry.name)));
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

const result = spawnSync('node', ['-c', ...jsFiles], { encoding: 'utf8' });
const elapsed = Date.now() - startTime;

if (result.status === 0) {
    console.log(`✨ Sucesso! ${jsFiles.length} arquivos validados em ${elapsed}ms.`);
    console.log('🎉 Nenhum erro de sintaxe encontrado no repositório.\n');
    process.exit(0);
} else {
    console.error('❌ ERRO DE SINTAXE ENCONTRADO:\n');
    if (result.stderr) console.error(result.stderr);
    if (result.stdout) console.log(result.stdout);
    process.exit(1);
}
