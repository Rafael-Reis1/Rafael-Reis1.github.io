# Leitor de Logs TOTVS/Fluig — Rust + GPUI

Versão desktop nativa em **Rust + GPUI** do [Leitor de Logs TOTVS/Fluig](../leitor.html), estruturada como Cargo workspace para coexistir com a PWA web sem interferir no GitHub Pages.

## Estrutura do Workspace

- `crates/fluig-log-core`: núcleo puro em Rust contendo modelo de domínio, parser em streaming (com suporte a múltiplos arquivos, BOM, UTF-8 multibyte, blocos `LOG CONFIGS`, agrupamento de linhas repetidas e descompressão `.gz`), mecanismo de busca/regex/filtros, exportação (`.log`, `.csv` com BOM UTF-8, `.json`) e persistência de preferências.
- `crates/fluig-log-gpui`: aplicação desktop acelerada por GPU usando `gpui`, com lista virtualizada (`uniform_list`), drag-and-drop nativo, colagem (`Ctrl+V`), seleção nativa de arquivos, dashboard interativo, highlight inline, atalhos de teclado e modal de exportação.

## Como executar e testar

Dentro de `Leitor-logs-totvs-fluig/rust-gpui`:

```bash
# Rodar os testes do núcleo
cargo test

# Rodar a aplicação desktop
cargo run -p fluig-log-gpui

# Compilar em modo release
cargo build --release -p fluig-log-gpui
```

## Publicação dos executáveis em `downloads/`

Os executáveis prontos ficam em [`../downloads/`](../downloads/) para download direto na página web.

### Windows (via script da raiz do repositório)

Na raiz (`Rafael-Reis1.github.io`), rode:

```powershell
npm run build:windows
# ou o atalho automático: npm run build:desktop
```

Esse comando compila em `--release` (com `strip` e `lto = "thin"`) e copia o binário para `Leitor-logs-totvs-fluig/downloads/fluig-log-gpui.exe`.

### Linux (ex.: VM Ubuntu Desktop 26.10)

Na VM Ubuntu Desktop com Node, Rust (`rustup`), compilador C (`build-essential`, `pkg-config`) e bibliotecas de janela/GPU solicitadas pelo `gpui`, rode na raiz do repositório (`Rafael-Reis1.github.io`):

```bash
npm run build:linux
# ou o atalho automático: npm run build:desktop
```

Ou manualmente via Cargo:

```bash
cd Leitor-logs-totvs-fluig/rust-gpui
cargo build --release -p fluig-log-gpui
mkdir -p ../downloads
cp target/release/fluig-log-gpui ../downloads/fluig-log-gpui-linux
chmod +x ../downloads/fluig-log-gpui-linux
```

### macOS

No macOS com Node, Rust (`rustup`) e Xcode Command Line Tools (`xcode-select --install`), rode na raiz do repositório (`Rafael-Reis1.github.io`):

```bash
npm run build:mac
# ou o atalho automático: npm run build:desktop
```

Ou manualmente via Cargo:

```bash
cd Leitor-logs-totvs-fluig/rust-gpui
cargo build --release -p fluig-log-gpui
mkdir -p ../downloads
cp target/release/fluig-log-gpui ../downloads/fluig-log-gpui-mac
chmod +x ../downloads/fluig-log-gpui-mac
```

Na página web, o botão `Baixar Desktop` começa oculto e só é exibido quando o arquivo correspondente ao sistema operacional do visitante (`fluig-log-gpui.exe`, `fluig-log-gpui-linux` ou `fluig-log-gpui-mac`) existe dentro de `Leitor-logs-totvs-fluig/downloads/`.

## Atalhos de Teclado

- `/` — Focar no campo de busca
- `P` — Fixar / desfixar linha ativa
- `I`, `W`, `E`, `D`, `F` — Alternar filtros `INFO`, `WARN`, `ERROR`, `DEBUG`, `Fixados`
- `Enter` — Expandir / recolher detalhes da linha ativa
- `Shift+Enter` — Expandir / recolher todos os detalhes
- `↑` / `↓` — Navegar (`Shift+↑/↓` pula 10 linhas)
- `PgUp` / `PgDn` ou `←` / `→` — Pular 40 linhas
- `Home` / `End` — Ir para o início / fim da lista
- `Ctrl+C` — Copiar ocorrência ativa
- `Ctrl+V` — Colar texto de log da área de transferência (quando fora de campos de texto)
- `Esc` — Fechar modal aberto ou voltar à tela inicial
