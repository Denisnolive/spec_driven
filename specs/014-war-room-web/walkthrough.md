# Walkthrough: War Room Web OpsPilot (`014-war-room-web`)

Construção da interface web oficial de operação (War Room) do OpsPilot em `web/` com **Vite**, **React**, **TypeScript** e **Vanilla CSS**, conectada aos endpoints do backend com suporte nativo a CORS, inspeção de raciocínio tipado e intervenção human-in-the-loop (status 202).

---

## 1. O Que Foi Entregue

### Backend Express (`src/http/server.ts`)
- **Middleware CORS Nativo**: Implementado com suporte a origens locais (`http://localhost:5173`), preflight `OPTIONS` com status 204 No Content, cabeçalhos permitidos (`Content-Type`, `X-Request-Id`, `Authorization`) e cabeçalho exposto `X-Request-Id`.
- **Testes de Integração de CORS**: Cobertura adicionada em `src/http/server.test.ts` validando resposta 204 e propagação de headers. 100% verde (38/38 testes na suíte do servidor e 165/165 testes no repositório).

### Frontend Web (`web/`)
- **Scaffold e Build**:
  - `web/package.json`: React 18, Vite 5, TypeScript 5.
  - `web/vite.config.ts`: Configurado com `base: '/opspilot/'` conforme especificado.
  - `web/index.html`: Metadados semânticos, SEO, acessibilidade e fontes Google (*Inter* e *JetBrains Mono*).
- **Design System & Tokens (`web/src/index.css`)**:
  - Implementação integral das diretrizes de `.github/instructions/designn.instrucions.md`.
  - Escala de espaçamento estrita base 4px/8px (`--space-1` a `--space-16`).
  - Tokens semânticos para Dark Mode e Light Mode (`--bg-canvas`, `--bg-surface`, `--text-primary`, `--border-subtle`, etc.).
  - Acessibilidade WCAG 2.1 AA: foco visível via `:focus-visible` com anel contrastante, `@media (prefers-reduced-motion: reduce)` e rolagem suave.
- **Componentes da War Room**:
  - **`Header.tsx`**: Logotipo OpsPilot, indicador de conectividade em tempo real (Online/Offline/Conectando), alternador de tema Claro/Escuro e botão de engrenagem para configurações.
  - **`SettingsModal.tsx`**: Modal acessível com foco preso (*trap*), edição da URL da API (padrão `http://localhost:3000`), botão *"Testar Conexão"* e persistência no `localStorage` (`opspilot_api_url`).
  - **`EmptyState.tsx`**: Tela de boas-vindas com ícone temático de terminal e atalhos operacionais rápidos de prompt (alertas, incidentes, runbooks).
  - **`ChatFeed.tsx` & `ChatMessageItem.tsx`**: Feed de mensagens com auto-scroll, indicador de digitação (*typing indicator*), renderização de markdown/código e rodapé com métricas de tempo de resposta, modelo e tokens.
  - **`ApprovalCard.tsx` (Status HTTP 202)**: Cartão especial destacado com severidade visual (amarelo/vermelho), justificativa da ação operacional e botões de *"Aprovar Ação"* e *"Negar Ação"*, permitindo controle humano estrito (*Human-in-the-Loop*).
  - **`TraceDrawer.tsx` ("Ver raciocínio")**: Gaveta lateral deslizante acessível (`role="dialog"`, `aria-modal="true"`) exibindo a linha do tempo cronológica dos nós do grafo (`router`, `tools`, `agent`, `reflect`), latência, tokens, payload JSON colapsável e suporte à tecla `Escape`.
  - **`ErrorBanner.tsx`**: Banner acessível (`role="alert"`) com mensagem amigável de erro e botão de nova tentativa (*retry*).

---

## 2. Validação e Qualidade

| Verificação | Comando | Resultado |
|---|---|---|
| **Typecheck do Frontend** | `npm run web:typecheck` | ✔ 0 erros de tipagem |
| **Build de Produção do Vite** | `npm run web:build` | ✔ Gerado em 1.24s com base `/opspilot/` |
| **Typecheck do Backend** | `npm run typecheck` | ✔ 0 erros de tipagem |
| **Suíte de Testes Automatizados** | `npm test` | ✔ 165 testes aprovados (0 falhas) |

---

## 3. Como Executar Localmente

### 1. Iniciar a War Room Web
```bash
npm run web:dev
```
Acesse no navegador: **`http://localhost:5173/opspilot/`**

### 2. Iniciar a API OpsPilot
```bash
npm run dev
```
Servidor atendendo em: **`http://localhost:3000`**
