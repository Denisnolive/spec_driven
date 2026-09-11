# Implementation Plan: War Room Web OpsPilot (Vite + React + TS)

**Branch**: `014-war-room-web` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-war-room-web/spec.md`

## Summary

Construir a interface web oficial de operação (War Room) do OpsPilot na pasta `web/` com **Vite**, **React** e **TypeScript**, aplicando rigorosamente as diretrizes de design visual, acessibilidade e temas definidos em `.github/instructions/designn.instrucions.md`:
1. **Configuração da Aplicação Web (`web/`)**:
   - Inicialização com Vite + React + TypeScript.
   - Configuração de subcaminho base `base: '/opspilot/'` em `vite.config.ts`.
   - Sistema de design CSS Vanilla com tokens semânticos (cores, superfícies, escala de espaçamento 4px/8px, tipografia e Dark Mode).
2. **Suporte a CORS no Backend Express (`src/http/server.ts`)**:
   - Middleware de CORS nativo no Express permitindo requisições de origens locais (`http://localhost:5173`, etc.).
   - Tratamento de preflight `OPTIONS` e liberação dos cabeçalhos `Content-Type`, `X-Request-Id` e exposição de `X-Request-Id`.
3. **Chat Operacional Conectado ao `/chat`**:
   - Histórico em memória e persistido por sessão (`conversationId`).
   - Feed de mensagens fluido com estados de envio e respostas formatadas em markdown.
   - *Empty State* receptivo com atalhos para perguntas frequentes sobre alertas e incidentes.
4. **Inspeção de Raciocínio ("Ver raciocínio")**:
   - Botão secundário em cada resposta do assistente.
   - Gaveta lateral (*drawer*) acessível exibindo o **trace tipado** (`TraceEventRecord`), nós de roteamento, ferramentas acionadas, métricas de tempo e tokens, com fechamento via teclado (`Escape`).
5. **Human-in-the-Loop: Tratamento de Status 202 (Cartão de Aprovar/Negar)**:
   - Respostas da API com status HTTP 202 (ou payload de ação pendente) são convertidas em um componente de cartão interativo.
   - Botões de *"Aprovar"* e *"Negar"* com disparo de confirmação/rejeição e feedback de estado.
6. **Preferências e URL da API (Ícone de Engrenagem)**:
   - Modal acessível no cabeçalho permitindo configurar a URL base da API do OpsPilot (`http://localhost:3000` por padrão), salva em `localStorage`.
7. **Acessibilidade e Usabilidade (WCAG 2.1 AA)**:
   - Anel de foco visível via `:focus-visible`, navegação completa por teclado, atributos ARIA adequados e respeito a `prefers-reduced-motion`.

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS, React 19 / 18, ESM (`"type": "module"`)

**Primary Dependencies**:
- Frontend (`web/`):
  - `react`, `react-dom`
  - `vite`, `@vitejs/plugin-react`
  - CSS Vanilla puro (sem TailwindCSS, cumprindo as regras do usuário e design system)
- Backend (`src/`):
  - `express`: servidor HTTP com rotas `/chat`, `/stats`, `/requests/:id`
  - `zod`: validação dos contratos na fronteira
  - Middleware CORS configurado em `src/http/server.ts`

**Storage & Persistence**:
- Frontend: `localStorage` para URL da API (`opspilot_api_url`) e tema (`opspilot_theme`).
- Backend: SQLite (`node:sqlite DatabaseSync`) via `sqliteTraceStore` e `sqliteConversationStore`.

**Testing & Validation**:
- Frontend: `tsc --noEmit` para validação de tipos TypeScript, build de produção do Vite (`npm run build`).
- Backend: `npm test` (`node:test` via `tsx`) e `npm run typecheck`.

**Target Platform**: Navegadores modernos (Chrome, Firefox, Edge, Safari) e Node.js 22 LTS no backend.

**Performance Goals**:
- Carregamento inicial do front-end: $< 1.5$s via Vite.
- Transição da gaveta de raciocínio (*drawer*): 200ms com GPU acceleration (`transform: translateX`).
- Latência de renderização do cartão de aprovação: $< 16$ms (60 FPS).

---

## Constitution Check

- **I. TypeScript Estrito e ESM** — PASS. Front-end e backend configurados com `"strict": true` e `"type": "module"`.
- **II. Validação na Fronteira (Zod)** — PASS. Validações Zod ativas no backend e tipos compartilhados/espelhados no frontend.
- **III. Arquitetura em Camadas** — PASS. Front-end modularizado (`components/`, `services/`, `types/`, `styles/`). Backend preserva separação entre HTTP, store e agentes.
- **IV. Test-First / Qualidade** — PASS. Testes do servidor backend atualizados para cobrir CORS e headers; build e typecheck do frontend validados.
- **V. Design & Acessibilidade** — PASS. Aderência irrestrita a [.github/instructions/designn.instrucions.md](file:///c:/dev/Aulas_UNIPDS/note-project-03/.github/instructions/designn.instrucions.md) (escala 4px/8px, WCAG 2.1 AA, tokens semânticos).

---

## Project Structure

### Documentation (this feature)

```text
specs/014-war-room-web/
├── spec.md                  # Especificação funcional e cenários de aceitação
├── plan.md                  # Este plano de implementação
├── research.md              # Pesquisa técnica e decisões de arquitetura
├── data-model.md            # Entidades do frontend e contratos da API
├── quickstart.md            # Guia rápido de execução e teste
└── tasks.md                 # Lista de tarefas acionáveis (/speckit.tasks)
```

### Source Code (web application & backend)

```text
web/
├── index.html               # Ponto de entrada HTML com metadados e tags de acessibilidade
├── package.json             # Dependências (React, Vite, TypeScript) e scripts
├── tsconfig.json            # Configuração TypeScript estrita
├── tsconfig.node.json       # Configuração TypeScript para Vite config
├── vite.config.ts           # Configuração do Vite com base: '/opspilot/' e proxy opcional
└── src/
    ├── main.tsx             # Bootstrap do React e montagem do root
    ├── App.tsx              # Componente orquestrador de estado e layout principal
    ├── index.css            # Design System: tokens CSS, dark mode, escala 4px/8px, reset e foco
    ├── types/
    │   ├── chat.ts          # Interfaces ChatMessage, TraceEventRecord, Metrics, ApprovalAction
    │   └── config.ts        # Interface de configuração e preferências da War Room
    ├── services/
    │   └── api.ts           # Cliente HTTP fetch para /chat, /stats e /requests/:id com baseURL dinâmica
    └── components/
        ├── Header.tsx       # Barra superior com status, toggle de tema e engrenagem de configurações
        ├── ChatFeed.tsx     # Área de rolagem das mensagens com detecção de final de conversa
        ├── ChatMessageItem.tsx # Item de mensagem com markdown simplificado e botão "Ver raciocínio"
        ├── ApprovalCard.tsx # Cartão interativo para respostas HTTP 202 (Aprovar/Negar)
        ├── TraceDrawer.tsx  # Gaveta lateral com visualização cronológica e tipada do trace
        ├── SettingsModal.tsx # Modal para configuração da URL da API OpsPilot
        ├── EmptyState.tsx   # Estado vazio acolhedor com prompts rápidos
        └── ErrorBanner.tsx  # Banner acessível para exibição de erros com ação de retry

src/http/
├── server.ts                # Atualização: suporte a CORS nativo e headers X-Request-Id
└── server.test.ts           # Atualização: teste de preflight OPTIONS e cabeçalhos CORS
```

---

## Implementation Phases

### Phase 1: Backend CORS Support
1. Adicionar middleware de CORS nativo em `src/http/server.ts` para suportar origens locais e expor `X-Request-Id`.
2. Validar que `npm test` continua 100% verde com novos testes de CORS.

### Phase 2: Web Scaffold & Design Tokens (`web/`)
1. Criar estrutura de arquivos em `web/` com `package.json`, `vite.config.ts` (`base: '/opspilot/'`), `tsconfig.json` e `index.html`.
2. Implementar `web/src/index.css` com a tabela completa de tokens semânticos (light e dark mode), escala de espaçamento de 4px/8px, anel de foco `:focus-visible` e suporte a `prefers-reduced-motion`.

### Phase 3: Tipagem e Serviços de Comunicação
1. Criar `web/src/types/chat.ts` espelhando com precisão as entidades do backend (`TraceEventRecord`, `RequestRecord`, `ChatMessage`).
2. Criar `web/src/services/api.ts` com leitura de `localStorage` para URL da API, tratamento de status 202 e injeção de `X-Request-Id`.

### Phase 4: Componentes da Interface War Room
1. Implementar `Header` com indicador de status, alternância de tema e botão de engrenagem.
2. Implementar `SettingsModal` com controle de foco (`trap`), input da URL da API e persistência.
3. Implementar `EmptyState` e `ErrorBanner`.
4. Implementar `ChatMessageItem` com botão *"Ver raciocínio"*.
5. Implementar `ApprovalCard` para renderização de status 202 com fluxo de aprovação e negação.
6. Implementar `TraceDrawer` com inspeção hierárquica e tipada do trace.
7. Integrar tudo no `App.tsx` com gerenciamento de estado unificado.

### Phase 5: Validação e Testes
1. Executar `tsc --noEmit` em `web/`.
2. Validar build do Vite (`npm run build`).
3. Validar execução local integrada entre frontend (`web/`) e backend (`server.ts`).
