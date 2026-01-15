# Portfólio de Rafael Reis 🚀

Bem-vindo ao meu portfólio oficial! Este repositório hospeda minha página pessoal e uma coleção de aplicações web desenvolvidas para resolver problemas reais, focando em arquitetura PWA (Progressive Web Apps), design moderno e alta performance.

🔗 **Acesse online:** [https://rafael-reis1.github.io/](https://rafael-reis1.github.io/)

---

## 👨‍💻 Sobre Mim

Sou um Desenvolvedor Web Full-Stack focado em criar aplicações robustas, escaláveis e com excelente experiência de usuário. Tenho experiência em construir PWAs, integrar serviços em nuvem (Firebase) e otimizar interfaces complexas.

* **Foco:** JavaScript (Vanilla & Frameworks), Node.js, HTML5, CSS3.
* **Interesses:** PWAs, Soluções Financeiras, Ferramentas de Produtividade, Inteligência Artificial Local e Dashboard Design.

---

## 🛠️ Projetos em Destaque

### 1. 📚 Reading Manager
Um gerenciador de biblioteca pessoal completo e PWA, focado em métricas reais de leitura e organização de acervo. Diferente de outras plataformas, ele foca no esforço de leitura (paginômetro) e não apenas na posse do livro.

* **Tecnologias:** JavaScript (Vanilla), Firebase (Firestore/Auth), OpenLibrary API, Google Books API, Chart.js.
* **Funcionalidades:**
    * 🏆 **Paginômetro Real:** Contabiliza páginas lidas considerando releituras e abandonos, medindo o esforço real do leitor.
    * 📅 **Metas e Estatísticas Anuais:** Gráficos detalhados separados por ano, evitando misturar dados de períodos diferentes.
    * 🏷️ **Sistema de Tags Flexível:** Permite classificar um livro como "Físico" e "Audiobook" simultaneamente.
    * 🔎 **Busca Integrada:** Localiza capas e metadados automaticamente via APIs externas.
    * ☁️ **Sincronização & Offline:** Funciona sem internet (PWA) e sincroniza dados via Firebase.
* **Código:** [`reading/`](./reading/)

### 2. 💰 Finance Manager
Uma Aplicação Web Progressiva (PWA) de gestão financeira pessoal com design Glassmorphism, focada em controle de fluxo de caixa e prevenção de dívidas.

* **Tecnologias:** Firebase (Auth, Firestore & Cloud Functions), Chart.js, Vanilla JS, Nodemailer.
* **Funcionalidades:**
    * 🧠 **Dashboard Inteligente:** Lógica híbrida que diferencia "Saldo Bancário Atual" de "Resultado do Mês" (Receitas - Despesas).
    * 🚨 **Gestão de Crise:** Sistema de alerta visual e filtros específicos para **Contas Vencidas**.
    * 📧 **Notificações Automáticas:** Envio de resumos semanais e alertas de vencimento por e-mail (via Firebase Cloud Functions).
    * 🔄 **Recorrência:** Gestão automática de assinaturas e despesas fixas.
    * 💾 **Backup Completo:** Exportação e importação de dados em JSON.
* **Código:** [`finance/`](./finance/)

### 3. 🤖 Chrome AI Local (Gemini Nano)
Uma interface de chat avançada que utiliza a API experimental de IA nativa do Google Chrome (`window.ai`), permitindo conversas com o modelo Gemini Nano rodando localmente no navegador, sem enviar dados para a nuvem.

* **Tecnologias:** JavaScript (Vanilla), Chrome AI API (Origin Trial), Marked.js, Highlight.js, Mermaid.js.
* **Funcionalidades:**
    * 💬 Chat em tempo real com processamento local (Privacy-first).
    * 🎭 **Sistema de Personas:** Criação e edição de assistentes personalizados.
    * 📊 **Renderização Visual:** Suporte a gráficos Mermaid, blocos de código e LaTeX.
    * 🖼️ **Preview de Código:** Visualização em tempo real de HTML/CSS/JS gerado pela IA.
* **Código:** [`chromeAILocal/`](./chromeAILocal/)

### 4. 📄 Leitor de Logs (Totvs Fluig)
Ferramenta especializada para análise de arquivos de log extensos, focado no ecossistema Totvs Fluig.

* **Tecnologias:** JavaScript, FileReader API, Regex.
* **Funcionalidades:**
    * ⚡ Processamento rápido de arquivos grandes no lado do cliente.
    * 🔍 **Filtros Avançados:** Por nível (INFO, WARN, ERROR), data/hora e busca com Regex.
    * 📑 Visualização hierárquica de Stack Traces.
* **Código:** [`Leitor-logs-totvs-fluig/`](./Leitor-logs-totvs-fluig/)

---

## 🧰 Utilitários e Experimentos

Além dos projetos principais, desenvolvi diversas ferramentas para automação de tarefas diárias:

* **Ambient Light Effect:** ([`Ambient-Light-SVG-Filters`](./Ambient-Light-SVG-Filters/))
    * Recria o efeito "Ambilight" em vídeos do YouTube usando filtros SVG avançados e iframes.
* **Comparador de Listas:** ([`Compara 2 listas de nomes`](./Compara%202%20listas%20de%20nomes/))
    * Identifica itens ausentes, adicionais e duplicados entre duas listas de texto.
* **Formatador de Listas:** ([`Formatar para lista separada por virgulas`](./Formatar%20para%20lista%20separada%20por%20virgulas/))
    * Utilitário para transformar colunas de dados (Excel/SQL) em listas formatadas para queries SQL (`IN (...)`).
* **Soma de Valores:** ([`somaValores`](./somaValores/))
    * Calculadora inteligente que extrai e soma valores monetários de textos desformatados.

---

## 🚀 Tecnologias Utilizadas no Repositório

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![Firebase](https://img.shields.io/badge/firebase-%23039BE5.svg?style=for-the-badge&logo=firebase)
![PWA](https://img.shields.io/badge/PWA-5A0FC8.svg?style=for-the-badge&logo=pwa&logoColor=white)
![Chart.js](https://img.shields.io/badge/chart.js-F5788D.svg?style=for-the-badge&logo=chart.js&logoColor=white)

---

## 📫 Contato

* **LinkedIn:** [Rafael Reis](https://www.linkedin.com/in/rafael-reis-00331b85/)
* **Email:** reisr5941@gmail.com

---
*Este portfólio é mantido por Rafael Reis. Sinta-se à vontade para explorar o código!*
