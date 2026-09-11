# OpsPilot 🛰️

OpsPilot é uma plataforma de copiloto e agente autônomo para operações de TI (AIOps), desenvolvida com **Node.js**, **TypeScript**, **LangGraph**, **Express** e uma interface web moderna de **War Room** em **Vite + React**.

O sistema orquestra fluxos de resolução de incidentes, análise de logs, diagnósticos de métricas e ações de mitigação, com suporte a fluxos **Human-in-the-Loop** (HITL) para ações sensíveis de infraestrutura.

---

## 📑 Sumário

- [Visão Geral e Recursos](#-visão-geral-e-recursos)
- [Arquitetura](#-arquitetura)
- [War Room Web](#-war-room-web)
- [Como Rodar Localmente](#-como-rodar-localmente)
  - [Pré-requisitos](#pré-requisitos)
  - [Inicialização do Backend](#inicialização-do-backend)
  - [Inicialização do Frontend](#inicialização-do-frontend)
- [Deploy no GitHub Pages](#-deploy-no-github-pages)
  - [Workflow do GitHub Actions](#workflow-do-github-actions)
  - [Configuração no GitHub](#configuração-no-github)
- [Scripts Disponíveis](#-scripts-disponíveis)
- [Configuração de Ambiente](#-configuração-de-ambiente)

---

## 🚀 Visão Geral e Recursos

- **Agentes Inteligentes**: Padrões ReAct e Plan-and-Execute gerenciados via LangGraph, capazes de pesquisar logs, métricas, listar pods e abrir incidentes.
- **Human-in-the-Loop (HITL)**: Operações críticas (ex.: redimensionamento de deployments, reinicialização de pods) geram uma resposta assíncrona HTTP 202 (`pending_approval`), aguardando aprovação explícita antes da execução.
- **Tracing Tipado**: Todo o fluxo de pensamento do agente (Thought, Action, Observation) é persistido e transmitido para a interface web.
- **War Room Responsiva e Acessível**: Interface web construída com Vanilla CSS moderno, paleta de cores balanceada, modo escuro/claro e componentes interativos.
- **Deploy Contínuo no GitHub Pages**: Pipeline automatizado no GitHub Actions usando `actions/upload-pages-artifact` e `actions/deploy-pages`.

---

## 🏛️ Arquitetura

```text
ops-pilot/
├── .github/
│   └── workflows/
│       └── deploy.yml    # Pipeline de CI/CD para GitHub Pages
├── src/
│   ├── agents/                 # Implementações de agentes ReAct, Plan-and-Execute e tools
│   ├── graph/                  # Grafos de estados compilados com LangGraph
│   ├── http/                   # Servidor Express, rotas /chat, /stats e CORS
│   ├── store/                  # Persistência SQLite para incidentes, conversas e traces
│   └── index.ts                # Ponto de entrada do servidor de API
├── web/                        # Interface War Room (Vite + React + TS)
│   ├── src/
│   │   ├── components/         # Chat, ThinkingAccordion, ApprovalCard, ConfigModal
│   │   ├── services/           # Cliente HTTP da API OpsPilot
│   │   └── App.tsx
│   └── vite.config.ts          # Configurado com base: '/opspilot/'
└── specs/                      # Especificações do Spec Kit
```

---

## 🖥️ War Room Web

A aplicação frontend está localizada no diretório `web/` e foi projetada para atuar como central de operações de incidentes:

- **Base Path**: Configurado com `base: '/spec_driven/'` em `web/vite.config.ts`, permitindo execução em subdiretórios tanto localmente quanto no GitHub Pages (`https://<usuario>.github.io/spec_driven/`).
- **Configuração Dinâmica da API (Ícone de Engrenagem)**: No topo da interface, clique no botão ⚙️ para abrir o modal de configurações e apontar a URL do backend Express (ex.: `http://localhost:3000` ou endpoint em nuvem). A URL é armazenada no `localStorage` do navegador.
- **Painel de Raciocínio ("Ver raciocínio")**: Acordeão interativo que detalha cada etapa do ciclo de raciocínio do modelo de linguagem.
- **Aprovação Interativa de Ações**: Cartões dedicados para comandos pendentes de aprovação humana, com botões para **Aprovar** ou **Rejeitar**.

---

## 🛠️ Como Rodar Localmente

### Pré-requisitos

- **Node.js**: versão 22 LTS ou superior.
- **npm**: versão 10 ou superior.

### Inicialização do Backend

1. Instale as dependências da raiz:
   ```bash
   npm install
   ```
2. Configure o arquivo `.env` (duplique `.env.example` se disponível ou configure as chaves necessárias como `OPENAI_API_KEY`, `PORT=3000`, etc.).
3. Popule o banco SQLite de desenvolvimento com sementes de teste:
   ```bash
   npm run seed
   ```
4. Inicie o servidor da API em modo de desenvolvimento:
   ```bash
   npm run dev
   ```
   *A API estará disponível em `http://localhost:3000`.*

### Inicialização do Frontend

1. Em outro terminal, inicialize a War Room Web a partir da raiz:
   ```bash
   npm run web:dev
   ```
   *A interface estará acessível em `http://localhost:5173/spec_driven/`.*
2. Abra a interface no navegador e verifique a URL da API no modal de configurações (ícone de engrenagem ⚙️).

---

## 🌐 Deploy no GitHub Pages

O frontend do OpsPilot possui esteira de deploy totalmente automatizada no **GitHub Pages** via **GitHub Actions**.

### Workflow do GitHub Actions

O arquivo [.github/workflows/deploy.yml](file:///.github/workflows/deploy.yml) realiza:
1. **Gatilhos**: Disparado automaticamente em cada `push` para a branch `main` com alterações em `web/**` ou `.github/workflows/**`, ou manualmente via `workflow_dispatch`.
2. **Segurança (Least Privilege)**:
   ```yaml
   permissions:
     contents: read
     pages: write
     id-token: write
   ```
3. **Concorrência**: Gerenciada com `group: 'pages'` e `cancel-in-progress: false` para evitar deploys simultâneos ou cancelamentos destrutivos.
4. **Job `build`**:
   - Instala as dependências do `web/` (`npm --prefix web ci`).
   - Compila os assets estáticos com Vite (`npm --prefix web run build`).
   - Compacta o diretório `web/dist` com `actions/upload-pages-artifact@v3`.
5. **Job `deploy`**:
   - Publica o artefato no ambiente `github-pages` com `actions/deploy-pages@v4`.

### Configuração no GitHub

Para habilitar a publicação automática:
1. No repositório no GitHub, acesse **Settings** > **Pages**.
2. Na seção **Build and deployment**, em **Source**, selecione **GitHub Actions**.
3. Ao realizar um push na branch `main`, a ação compilará e publicará a War Room na URL:
   ```text
   https://<seu-usuario-ou-org>.github.io/spec_driven/
   ```
4. Ao abrir a página pela primeira vez no GitHub Pages, clique na engrenagem ⚙️ e configure a URL do seu servidor backend (ou utilize um túnel como `ngrok` ou serviço na nuvem).

---

## 📜 Scripts Disponíveis

### Raiz (Backend & Global)

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor HTTP Express com hot-reload (`src/index.ts`) |
| `npm test` | Executa a suíte de testes de unidade e integração automatizados |
| `npm run typecheck` | Validação de tipagem TypeScript do backend |
| `npm run seed` | Popula dados de incidentes e telemetria no SQLite |
| `npm run bench` | Executa benchmarks de performance dos fluxos de agente |
| `npm run arena` | Executa cenários comparativos entre arquiteturas de agentes |
| `npm run web:dev` | Inicia o servidor de desenvolvimento do Vite na pasta `web/` |
| `npm run web:build` | Executa o build de produção do frontend (`web/dist`) |
| `npm run web:typecheck`| Valida a tipagem TypeScript da aplicação React |

### Frontend (`web/`)

| Comando | Descrição |
| :--- | :--- |
| `npm --prefix web run dev` | Inicia Vite Dev Server na porta 5173 |
| `npm --prefix web run build` | Compila os assets otimizados para `web/dist` |
| `npm --prefix web run preview` | Visualiza localmente o build de produção |

---

## ⚙️ Configuração de Ambiente

Crie ou edite o arquivo `.env` na raiz do projeto com as variáveis necessárias:

```env
PORT=3000
NODE_ENV=development
OPENAI_API_KEY=sua-chave-openai
DATABASE_URL=sqlite:./data/ops-pilot.sqlite
```

---

## 📄 Licença

Este projeto é parte integrante do material pedagógico do curso de Engenharia de Software e AIOps.
