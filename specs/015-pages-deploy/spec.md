# Feature Specification: Deploy da War Room Web no GitHub Pages via GitHub Actions

**Feature Branch**: `015-pages-deploy`  
**Created**: 2026-09-11  
**Status**: Complete  
**Input**: User description: "Deploy do web/ no Pages via Actions: upload-pages-artifact + deploy-pages, permissions, README (atualizar)"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pipeline de Build e Deploy Automatizado no GitHub Pages (Priority: P1)

Como engenheiro de DevOps e mantenedor do OpsPilot, quero que cada alteração realizada na interface web (`web/`) ou na branch principal dispare automaticamente um workflow do GitHub Actions para compilar os assets estáticos com Vite (`base: '/opspilot/'`) e publicá-los no GitHub Pages utilizando as actions oficiais `actions/upload-pages-artifact` e `actions/deploy-pages`, para que a War Room esteja sempre disponível online sem intervenção manual.

**Why this priority**: É o objetivo central da automação de entrega contínua (CD). Garante a publicação previsível e reprodutível do frontend web no ambiente de produção estático do GitHub Pages.

**Independent Test**:
1. Acionar o workflow manualmente (`workflow_dispatch`) ou via push na branch principal.
2. Conferir a execução sequencial dos jobs `build` e `deploy`.
3. Validar que o job `build` instala as dependências do `web/`, executa `npm run build` e compacta o diretório `web/dist` através de `actions/upload-pages-artifact`.
4. Validar que o job `deploy` publica o artefato no ambiente `github-pages` com `actions/deploy-pages`.
5. Acessar a URL publicada (ex: `https://<usuario>.github.io/opspilot/`) e constatar que a aplicação carrega todos os assets JS/CSS sem erros 404 graças ao prefixo de base `/opspilot/`.

**Acceptance Scenarios**:
1. **Given** um commit enviado para a branch `main` contendo modificações em `web/**` ou `.github/workflows/**`,  
   **When** o GitHub Actions detecta o evento de push,  
   **Then** o workflow de deploy é iniciado automaticamente.
2. **Given** o job de build em execução,  
   **When** o comando `npm run build` do `web/` é finalizado com sucesso gerando a pasta `web/dist`,  
   **Then** a action `actions/upload-pages-artifact` empacota `./web/dist` como o artefato oficial de deployment do Pages.
3. **Given** o artefato carregado com sucesso,  
   **When** o job `deploy` assume a execução,  
   **Then** a action `actions/deploy-pages` publica o site no environment `github-pages` e expõe a URL final de acesso.

---

### User Story 2 - Definição de Permissões Mínimas e Controle de Concorrência (Priority: P1)

Como responsável pela segurança e integridade do repositório, quero que o workflow configure estritamente as permissões OIDC necessárias (`id-token: write`, `pages: write`, `contents: read`) e estabeleça um grupo de concorrência (`concurrency`) para o GitHub Pages, para que não ocorram deploys simultâneos conflitantes nem vazamento de privilégios.

**Why this priority**: Conformidade com o princípio do menor privilégio (*least privilege*) exigido pela arquitetura moderna do GitHub Pages e prevenção de *race conditions* entre commits concorrentes.

**Independent Test**:
1. Inspecionar o arquivo de workflow YAML quanto à presença do bloco `permissions`.
2. Validar que `contents: read`, `pages: write` e `id-token: write` estão declarados.
3. Inspecionar o bloco `concurrency` com `group: 'pages'` e `cancel-in-progress: false`.

**Acceptance Scenarios**:
1. **Given** o arquivo de workflow do GitHub Actions,  
   **When** as permissões de execução do token forem avaliadas,  
   **Then** somente `contents: read`, `pages: write` e `id-token: write` são concedidas ao job.
2. **Given** dois commits realizados em rápida sucessão na branch principal,  
   **When** as execuções do workflow forem enfileiradas,  
   **Then** o grupo de concorrência garante que os deploys ocorram ordenadamente um por vez sem sobrescrita destrutiva de estado intermediário.

---

### User Story 3 - Documentação Central e Atualização do README (Priority: P2)

Como desenvolvedor ou operador que clona o repositório, quero consultar o `README.md` na raiz para entender o propósito do OpsPilot, como rodar o backend e frontend localmente, e como funciona o deploy no GitHub Pages e a configuração da URL da API na War Room, para que a integração e a operação sejam claras e auto-explicativas.

**Why this priority**: A documentação é essencial para onboarding, clareza operacional e manutenção sustentável do projeto por outros membros do time.

**Independent Test**:
1. Abrir o arquivo `README.md` na raiz do repositório.
2. Verificar a existência das seções:
   - Visão Geral do OpsPilot e Stack Tecnológica.
   - Execução local do Backend Express e da War Room Web (`/opspilot/`).
   - Guia de Deploy no GitHub Pages via GitHub Actions.
   - Instruções de configuração da URL da API via ícone de engrenagem na interface web.
   - Comandos de teste e verificação de qualidade (`npm test`, `npm run typecheck`).

**Acceptance Scenarios**:
1. **Given** o arquivo `README.md`,  
   **When** o leitor seguir os passos descritos,  
   **Then** ele consegue executar tanto a API quanto a interface web localmente e entende o fluxo de deploy automatizado.

---

## Edge Cases

- **Build do Vite falhar:** Se houver erro de tipagem no TypeScript (`tsc`) ou no bundling do Vite durante o job de build, o workflow deve falhar imediatamente sem disparar a action de deploy, impedindo a publicação de uma versão quebrada.
- **Paths não estáticos / SPA Routing:** Como o GitHub Pages serve arquivos estáticos, o `base: '/opspilot/'` garante que os assets sejam requisitados a partir do subdiretório correto do repositório (`/<repo-name>/assets/...`).
- **Disparo manual (`workflow_dispatch`):** Permitir a execução manual do pipeline pelo painel do GitHub Actions a qualquer momento sem necessidade de commit vazio.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O repositório DEVE possuir um workflow em `.github/workflows/deploy-pages.yml` configurado para deploy no GitHub Pages.
- **FR-002**: O workflow DEVE ser disparado por eventos de `push` na branch principal (`main`) quando houver alterações em `web/**` ou `.github/workflows/**`, além de suportar `workflow_dispatch`.
- **FR-003**: O workflow DEVE definir explicitamente as permissões mínimas:
  ```yaml
  permissions:
    contents: read
    pages: write
    id-token: write
  ```
- **FR-004**: O workflow DEVE configurar concorrência segura:
  ```yaml
  concurrency:
    group: 'pages'
    cancel-in-progress: false
  ```
- **FR-005**: O job de build DEVE utilizar `actions/setup-node@v4` com versão Node 22 e cache de dependências npm.
- **FR-006**: O job de build DEVE executar a compilação do frontend web gerando os artefatos estáticos em `./web/dist`.
- **FR-007**: O upload do artefato DEVE utilizar a action oficial `actions/upload-pages-artifact@v3` apontando para o caminho `./web/dist`.
- **FR-008**: O deploy DEVE ser executado em um job separado utilizando `actions/deploy-pages@v4`, associado ao environment `github-pages`.
- **FR-009**: O arquivo `README.md` DEVE ser criado/atualizado na raiz do repositório, documentando a War Room Web, o backend OpsPilot, os scripts de execução local e a arquitetura do pipeline do GitHub Pages.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O workflow `.github/workflows/deploy-pages.yml` deve ser um YAML válido e aprovado pela sintaxe oficial do GitHub Actions.
- **SC-002**: O tempo de execução do job de build do frontend no pipeline deve ser inferior a 2 minutos.
- **SC-003**: O arquivo `README.md` deve cobrir 100% dos tópicos operacionais requeridos (stack, backend, web, CORS, deploy Pages, e comandos npm).

---

## Assumptions

- O repositório no GitHub terá o GitHub Pages habilitado com a opção de publicação configurada para "GitHub Actions" nas configurações do repositório (*Settings > Pages > Build and deployment > Source: GitHub Actions*).
- O nome base configurado no Vite (`base: '/opspilot/'`) corresponde ao subcaminho padrão da URL pública do GitHub Pages.
