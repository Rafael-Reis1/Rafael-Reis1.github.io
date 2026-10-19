const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IGNORED_DIRS = new Set(['node_modules', '.git', '.gemini', 'assets', 'vendor', '.npm-cache']);
const jsFiles = [];

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
    process.exit(0);
}

console.error(`\n❌ ${failures.length} arquivo(s) com erro de sintaxe:`);
failures.forEach((file) => console.error(`   - ${file}`));
console.error('');
process.exit(1);
