# Implementation Plan: Deploy da War Room Web no GitHub Pages via GitHub Actions

**Branch**: `015-pages-deploy` | **Date**: 2026-09-11 | **Status**: Implemented | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-pages-deploy/spec.md`

## Summary

Implementar a automação completa de Integração e Entrega Contínua (CI/CD) para compilar e publicar a aplicação web do OpsPilot (`web/`) no GitHub Pages utilizando GitHub Actions oficiais, com permissões mínimas, concorrência controlada e documentação central no `README.md`:
1. **GitHub Actions Workflow (`.github/workflows/deploy-pages.yml`)**:
   - Disparado por push na branch principal (`main`) com filtros de path em `web/**` e `.github/workflows/**`, além de `workflow_dispatch`.
   - Permissões explícitas: `contents: read`, `pages: write`, `id-token: write`.
   - Grupo de concorrência: `concurrency: { group: 'pages', cancel-in-progress: false }`.
   - **Job 1 (`build`)**:
     - Checkout do repositório (`actions/checkout@v4`).
     - Setup do Node 22 com cache de dependências npm (`actions/setup-node@v4`).
     - Instalação das dependências (`npm --prefix web ci` ou `npm --prefix web install`).
     - Compilação estática (`npm --prefix web run build`) gerando `./web/dist` com `base: '/opspilot/'`.
     - Upload do artefato oficial do Pages (`actions/upload-pages-artifact@v3` com path `./web/dist`).
   - **Job 2 (`deploy`)**:
     - Dependência: `needs: build`.
     - Environment configurado: `name: github-pages`, `url: ${{ steps.deployment.outputs.page_url }}`.
     - Publicação automática via `actions/deploy-pages@v4`.
2. **Documentação Centralizada (`README.md`)**:
   - Criação do `README.md` na raiz do repositório cobrindo arquitetura do OpsPilot, backend, frontend, comandos locais (`dev`, `web:dev`, `web:build`), configuração da URL da API na War Room e detalhes do pipeline de deploy no GitHub Pages.

---

## Technical Context

**Language/Version**: YAML (GitHub Actions Workflow), Markdown (Documentação), Node.js 22 LTS, Vite 5.x

**Primary Dependencies & Actions**:
- `actions/checkout@v4`
- `actions/setup-node@v4`
- `actions/upload-pages-artifact@v3`
- `actions/deploy-pages@v4`

**Target Environment**: GitHub Pages (`https://<user>.github.io/opspilot/`)

**Constraints**:
- Seguir o padrão de permissões mínimas exigido pelo GitHub Pages para deployments via Actions.
- Preservar o subcaminho `base: '/opspilot/'` já configurado em `web/vite.config.ts`.
- Garantir que o `concurrency` evite conflitos de múltiplos deploys simultâneos.

---

## Constitution Check

- **I. Automação e Entrega Contínua** — PASS. O workflow utiliza as actions recomendadas oficialmente pelo GitHub para deploy no Pages sem dependência de branches de build legadas (`gh-pages`).
- **II. Segurança e Permissões** — PASS. Concessão estrita de `pages: write`, `id-token: write` e `contents: read`.
- **III. Documentação e Qualidade** — PASS. Criação de documentação clara e completa em `README.md`.

---

## Project Structure

### Documentation (this feature)

```text
specs/015-pages-deploy/
├── spec.md                  # Especificação funcional e cenários
├── plan.md                  # Este plano de implementação
├── research.md              # Pesquisa técnica sobre actions de deploy e permissões
└── quickstart.md            # Guia rápido de validação local e no GitHub
```

### Source Code & Configuration

```text
.github/
└── workflows/
    └── deploy-pages.yml     # Workflow de CI/CD para GitHub Pages

README.md                    # Documentação central do repositório
```

---

## Implementation Phases

### Phase 1: Workflow de Deploy no GitHub Pages
1. Criar o diretório `.github/workflows/` se não existir.
2. Criar `.github/workflows/deploy-pages.yml` com as configurações de trigger (`push` em `main` e `workflow_dispatch`).
3. Declarar permissões (`contents: read`, `pages: write`, `id-token: write`) e concorrência (`pages`).
4. Configurar os jobs `build` (setup node, install, build, `upload-pages-artifact`) e `deploy` (`deploy-pages`).

### Phase 2: Documentação do Repositório (README.md)
1. Criar `README.md` completo e bem estruturado na raiz do repositório.
2. Documentar o que é o OpsPilot, suas características e arquitetura de agentes (LangGraph, ReAct, Plan-and-Execute, Reflection).
3. Documentar a War Room Web (`web/`), sua pilha (Vite, React, TypeScript, Vanilla CSS) e o suporte a Dark Mode e acessibilidade.
4. Documentar o processo de Deploy no GitHub Pages e a configuração da URL da API na interface web.
5. Adicionar tabela de comandos e scripts npm.

### Phase 3: Validação
1. Validar sintaxe do arquivo YAML `.github/workflows/deploy-pages.yml`.
2. Validar que o build do `web/` continua passando localmente (`npm run web:build`).
3. Validar consistência do `README.md`.
