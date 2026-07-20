const fs   = require('fs');
const path = require('path');

const now = new Date();
const dd = String(now.getDate()).padStart(2, '0');
const MM = String(now.getMonth() + 1).padStart(2, '0'); 
const aa = String(now.getFullYear()).slice(-2);         
const HH = String(now.getHours()).padStart(2, '0');
const mm = String(now.getMinutes()).padStart(2, '0');

const newVersion = `${dd}${MM}${aa}${HH}${mm}`;
const newStr = `?v=${newVersion}`;
const versionRegex = /\?v=\d+/g;

console.log(`\n🔄  Atualizando cache de todos os projetos para a versão: ${newVersion}\n`);

const IGNORED_DIRS  = new Set(['node_modules', '.git', 'fonts', 'assets', 'vendor', 'imgConver', 'imgs', 'docs']);
const VALID_EXTS    = new Set(['.html', '.js', '.css', '.json']);

let totalFiles   = 0;
let totalChanges = 0;

function walkAndReplace(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) walkAndReplace(path.join(dir, entry.name));
            continue;
        }

        if (!VALID_EXTS.has(path.extname(entry.name))) continue;

        const filePath = path.join(dir, entry.name);
        const content  = fs.readFileSync(filePath, 'utf8');

        if (!versionRegex.test(content)) continue;

        const count = (content.match(versionRegex) || []).length;
        
        const updated = content.replace(versionRegex, newStr);

        if (content !== updated) {
            fs.writeFileSync(filePath, updated, 'utf8');
            const relPath = path.relative(__dirname, filePath);
            console.log(`  ✅  ${relPath}  (${count} ocorrência${count > 1 ? 's' : ''})`);
            totalFiles++;
            totalChanges += count;
        }
    }
}

walkAndReplace(__dirname);

if (totalChanges === 0) {
    console.log(`\nℹ️   A versão do cache já é a mais recente. Nenhuma alteração foi feita.\n`);
} else {
    console.log(`\n✨  Concluído! ${totalChanges} ocorrências atualizadas em ${totalFiles} arquivo${totalFiles !== 1 ? 's' : ''}.\n`);
}
