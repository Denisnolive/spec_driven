# Tasks: Deploy da War Room Web no GitHub Pages via GitHub Actions

**Input**: Design documents from `/specs/015-pages-deploy/`  
**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required), [research.md](./research.md), [quickstart.md](./quickstart.md)  
**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Garantir a estrutura de diretórios para os workflows do GitHub Actions

- [x] T001 Criar diretório para workflows do GitHub Actions em [.github/workflows/](file:///c:/dev/Aulas_UNIPDS/note-project-03/.github/workflows)

---

## Phase 2: User Story 1 - Pipeline de Build e Deploy Automatizado (Priority: P1) 🎯 MVP

**Goal**: Configurar o pipeline no GitHub Actions para compilar a aplicação Vite (`web/`) com base `/opspilot/` e publicá-la no GitHub Pages via `actions/upload-pages-artifact` e `actions/deploy-pages`.

**Independent Test**:
1. Inspecionar [.github/workflows/deploy-pages.yml](file:///c:/dev/Aulas_UNIPDS/note-project-03/.github/workflows/deploy-pages.yml) e verificar os triggers (`push` para `main` com filtros em `web/**` e `.github/workflows/**`, além de `workflow_dispatch`).
2. Verificar os passos do job `build`: `actions/checkout@v4`, `actions/setup-node@v4` (Node 22), instalação de dependências e `npm run build` no diretório `web/`.
3. Verificar a geração e o upload do artefato com `actions/upload-pages-artifact@v3` apontando para `./web/dist`.
4. Verificar o job `deploy` utilizando `actions/deploy-pages@v4` no environment `github-pages`.

### Implementation for User Story 1

- [x] T002 [US1] Criar a estrutura base do workflow em [.github/workflows/deploy-pages.yml](file:///c:/dev/Aulas_UNIPDS/note-project-03/.github/workflows/deploy-pages.yml) com eventos `push` (branch `main`, paths `web/**` e `.github/workflows/**`) e `workflow_dispatch`
- [x] T003 [US1] Implementar o job `build` em [.github/workflows/deploy-pages.yml](file:///c:/dev/Aulas_UNIPDS/note-project-03/.github/workflows/deploy-pages.yml) com checkout, setup Node 22 com cache npm, instalação de dependências, compilação de `web/` e upload do artefato via `actions/upload-pages-artifact@v3` (path: `./web/dist`)
- [x] T004 [US1] Implementar o job `deploy` em [.github/workflows/deploy-pages.yml](file:///c:/dev/Aulas_UNIPDS/note-project-03/.github/workflows/deploy-pages.yml) dependente de `build` (`needs: build`), com environment `name: github-pages`, extração da URL de saída (`page_url`) e execução da action `actions/deploy-pages@v4`

**Checkpoint**: Pipeline de build e deploy definido e pronto para execução no GitHub Actions.

---

## Phase 3: User Story 2 - Permissões Mínimas e Concorrência Segura (Priority: P1)

**Goal**: Assegurar que o workflow execute com permissões mínimas OIDC (`contents: read`, `pages: write`, `id-token: write`) e concorrência serializada (`concurrency: { group: 'pages', cancel-in-progress: false }`).

**Independent Test**:
1. Inspecionar o bloco `permissions` no arquivo [.github/workflows/deploy-pages.yml](file:///c:/dev/Aulas_UNIPDS/note-project-03/.github/workflows/deploy-pages.yml) e atestar a ausência de privilégios desnecessários.
2. Inspecionar o bloco `concurrency` e certificar-se de que novos deploys não cancelam o deploy em andamento de forma abrupta.

### Implementation for User Story 2

- [x] T005 [US2] Declarar bloco de permissões explícitas de menor privilégio (`contents: read`, `pages: write`, `id-token: write`) em [.github/workflows/deploy-pages.yml](file:///c:/dev/Aulas_UNIPDS/note-project-03/.github/workflows/deploy-pages.yml)
- [x] T006 [US2] Configurar grupo de concorrência com serialização ordenada (`group: 'pages'`, `cancel-in-progress: false`) em [.github/workflows/deploy-pages.yml](file:///c:/dev/Aulas_UNIPDS/note-project-03/.github/workflows/deploy-pages.yml)

**Checkpoint**: Configuração de segurança e concorrência validada no workflow.

---

## Phase 4: User Story 3 - Documentação Centralizada no README (Priority: P2)

**Goal**: Criar documentação completa no `README.md` na raiz do repositório, cobrindo o OpsPilot, backend Express/LangGraph, a War Room Web (`web/`), configuração da URL da API (ícone de engrenagem), deploy no Pages e comandos de execução.

**Independent Test**:
1. Abrir o arquivo [README.md](file:///c:/dev/Aulas_UNIPDS/note-project-03/README.md).
2. Validar a presença das seções essenciais: Visão Geral, Arquitetura de Agentes, Como Rodar Localmente (API e Web), Configuração da War Room (Endpoint da API), Deploy no GitHub Pages e Scripts npm.

### Implementation for User Story 3

- [x] T007 [P] [US3] Criar documentação central em [README.md](file:///c:/dev/Aulas_UNIPDS/note-project-03/README.md) detalhando visão geral, arquitetura do OpsPilot, instruções de inicialização da API Express e do frontend Vite (`web/`)
- [x] T008 [US3] Adicionar ao [README.md](file:///c:/dev/Aulas_UNIPDS/note-project-03/README.md) as instruções operacionais de configuração da War Room (modal de configuração com persistência de URL no localStorage, suporte a CORS) e guia de deploy contínuo no GitHub Pages via GitHub Actions

**Checkpoint**: Documentação centralizada e atualizada para desenvolvedores e operadores.

---

## Phase 5: Polish & Validação Final

**Purpose**: Verificações finais de consistência, validação de sintaxe e compilação do frontend

- [x] T009 [P] Validar a sintaxe do arquivo YAML [.github/workflows/deploy-pages.yml](file:///c:/dev/Aulas_UNIPDS/note-project-03/.github/workflows/deploy-pages.yml)
- [x] T010 Validar que a compilação de produção do frontend (`npm run web:build`) gera o diretório `web/dist` sem falhas e em conformidade com o path `./web/dist` da action
- [x] T011 [P] Atualizar o status da especificação em [specs/015-pages-deploy/spec.md](file:///c:/dev/Aulas_UNIPDS/note-project-03/specs/015-pages-deploy/spec.md) e [specs/015-pages-deploy/plan.md](file:///c:/dev/Aulas_UNIPDS/note-project-03/specs/015-pages-deploy/plan.md) para Implemented/Complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências — execução imediata.
- **User Story 1 (Phase 2 - MVP)**: Depende da Phase 1. Cria a espinha dorsal do workflow no Actions.
- **User Story 2 (Phase 3)**: Integrado diretamente ao workflow criado na US1.
- **User Story 3 (Phase 4)**: Pode ser executado em paralelo ou logo após a definição do workflow.
- **Polish (Phase 5)**: Depende da conclusão das fases anteriores.
