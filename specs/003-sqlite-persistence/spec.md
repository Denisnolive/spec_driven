# Feature Specification: Persistência Real de Operações com SQLite

**Feature Branch**: `003-sqlite-persistence`  
**Created**: 2026-09-02  
**Status**: Draft  
**Input**: User description: "Persistência real de operações: SqliteOpsStore (src/store/sqlite-ops-store.ts) implementa a interface OpsStore existente via node:sqlite (DatabaseSync); caminho em OPSPILOT_DB (default ./data/opspilot.db); ':memory:' nos testes; 4 tabelas - services, alerts, incidents, runbooks - espelhando os tipos atuais do domínio (incidents ganha resolved_at e summary, anuláveis); DDL idempotente no construtor; CHECK em todo campo de domínio fechado (tier, severity, status); seed idempotente = cenário Mercadinho do mock (5 serviços, 6 alertas: 3 firing, 3 resolved; runbooks de checkout/payments/auth); prepared statements em toda query; Sem SQL concatenado; tools novas: list_incidents(status open | resolved | all, default open) e consultar_runbook(service) - descrições pelas 6 regras; composição injeta o SqliteOpsStore; mock in memory fica para testes e para o bench (cenarios possam ser reproduzidos); data/ no .gitignore; revisar descrições de src/agents/tools.ts pelas 6 regras (dívida do open_incident: quando usar; .describe() em todo campo; enums); testes ':memory:' seed, abrir/listar/resolver, filtros e CHECKs; testes das tools existentes passam a rodar sobre ':memory:'"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Persistência Real e Determinística de Operações (Priority: P1)

Como operador ou agente autônomo do OpsPilot, quero que todas as operações (alertas, incidentes, serviços e runbooks) sejam armazenadas de forma persistente e confiável em banco SQLite local (`node:sqlite` com `DatabaseSync`) sem depender de daemons externos de banco de dados, suportando inicialização automática e seed determinístico.

**Why this priority**: É a espinha dorsal de persistência do sistema, permitindo que alterações de estado feitas por ferramentas sobrevivam a reinicializações e funcionem com baixa latência.

**Independent Test**: Pode ser testado instanciando `SqliteOpsStore` em arquivo ou `:memory:`, executando o `seed()` e verificando a presença dos 5 serviços, 6 alertas e runbooks correspondentes.

**Acceptance Scenarios**:
1. **Given** um caminho de banco de dados especificado em `OPSPILOT_DB` (ou padrão `./data/opspilot.db`),  
   **When** `SqliteOpsStore` é instanciado,  
   **Then** o diretório `./data` é criado se necessário e as 4 tabelas (`services`, `alerts`, `incidents`, `runbooks`) são criadas de maneira idempotente com constraints `CHECK`.

2. **Given** um banco recém-criado,  
   **When** `store.seed()` é chamado,  
   **Then** popula 5 serviços (Mercadinho), 6 alertas (3 firing, 3 resolved) e runbooks operacionais sem duplicar registros em chamadas subsequentes.

---

### User Story 2 - Gestão de Incidentes com Ciclo de Vida Completo (Priority: P1)

Como operador ou agente ReAct, quero abrir incidentes operacionais para serviços com severidade definida e, posteriormente, resolvê-los registrando timestamp (`resolved_at`) e sumário de resolução (`summary`), além de listar incidentes filtrando por status (`open`, `resolved`, `all`).

**Why this priority**: O gerenciamento de incidentes é a ação primária de mitigação do agente de operações.

**Independent Test**: Testável abrindo um incidente via `openIncident({ title, service, severity })`, verificando que status inicial é `open`, listando via `listIncidents('open')`, e em seguida resolvendo via `resolveIncident(id, summary)` e verificando que status passa para `resolved` com `resolved_at` e `summary` preenchidos.

**Acceptance Scenarios**:
1. **Given** uma solicitação de abertura de incidente válida,  
   **When** `openIncident` é invocado,  
   **Then** insere o registro com status `open`, gera um ID numérico único e retorna a entidade completa.

2. **Given** um incidente com status `open`,  
   **When** `resolveIncident(id, summary)` é executado,  
   **Then** o status é atualizado para `resolved`, `resolved_at` recebe timestamp ISO/data atual e `summary` é persistido.

3. **Given** uma tentativa de criar incidente com severidade fora do enum (`'invalid'`),  
   **When** a query é executada no SQLite,  
   **Then** a constraint `CHECK(severity IN ('low', 'medium', 'high', 'critical'))` rejeita a inserção gerando erro.

---

### User Story 3 - Consulta de Runbooks Operacionais (Priority: P2)

Como agente de operações, quero consultar o guia de resolução (runbook) associado a um serviço afetado para obter instruções de diagnóstico, mitigação e recuperação.

**Why this priority**: Permite que o agente tome decisões fundamentadas e execute passos precisos de remediação recomendados pelo time de engenharia.

**Independent Test**: Testável chamando `getRunbook('checkout')` ou `consultar_runbook` e obtendo os procedimentos operacionais estruturados.

**Acceptance Scenarios**:
1. **Given** um serviço que possui runbook cadastrado no seed (`checkout`, `payments` ou `auth`),  
   **When** `getRunbook(service)` é chamado,  
   **Then** retorna o runbook correspondente com título e conteúdo detalhado.

2. **Given** um serviço sem runbook cadastrado,  
   **When** `getRunbook('unknown-service')` é chamado,  
   **Then** retorna `null` (ou mensagem amigável de não encontrado na tool).

---

### User Story 4 - Ferramentas do Agente Padronizadas pelas 6 Regras (Priority: P2)

Como engenheiro de prompt/LLM, quero que todas as ferramentas em `src/agents/tools.ts` sigam estritamente as 6 regras de engenharia de prompt (objetivo claro, quando usar, quando não usar, formato de retorno, describe em todos os campos Zod e validação por enum) para maximizar a precisão do raciocínio dos agentes ReAct e Plan-and-Execute.

**Why this priority**: Evita alucinações da LLM sobre quando invocar cada ferramenta e garante schemas rigorosamente validados.

**Independent Test**: Testável inspecionando as propriedades `.name`, `.description` e `.schema` de cada ferramenta exposta em `opsTools`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE fornecer `SqliteOpsStore` em `src/store/sqlite-ops-store.ts` implementando a interface `OpsStore`.
- **FR-002**: `SqliteOpsStore` DEVE utilizar `node:sqlite` nativo (`DatabaseSync`).
- **FR-003**: O caminho do banco DEVE ser obtido da variável de ambiente `OPSPILOT_DB`, utilizando `./data/opspilot.db` como padrão e suportando `":memory:"` para testes e benchmarks.
- **FR-004**: O diretório `./data` DEVE ser ignorado no `.gitignore` (`data/` e `*.db`).
- **FR-005**: O banco DEVE conter 4 tabelas com constraints `CHECK` e DDL idempotente:
  - `services`: `id` (INTEGER PK AUTOINCREMENT), `name` (TEXT UNIQUE NOT NULL), `tier` (TEXT NOT NULL CHECK(tier IN ('tier-1', 'tier-2', 'tier-3')) DEFAULT 'tier-2'), `created_at` (TEXT NOT NULL DEFAULT (datetime('now')))
  - `alerts`: `id` (INTEGER PK AUTOINCREMENT), `title` (TEXT NOT NULL), `service` (TEXT NOT NULL), `severity` (TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical'))), `status` (TEXT NOT NULL CHECK(status IN ('firing', 'resolved')) DEFAULT 'firing'), `created_at` (TEXT NOT NULL DEFAULT (datetime('now')))
  - `incidents`: `id` (INTEGER PK AUTOINCREMENT), `title` (TEXT NOT NULL), `service` (TEXT NOT NULL), `severity` (TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical'))), `status` (TEXT NOT NULL CHECK(status IN ('open', 'resolved')) DEFAULT 'open'), `resolved_at` (TEXT NULL), `summary` (TEXT NULL), `created_at` (TEXT NOT NULL DEFAULT (datetime('now')))
  - `runbooks`: `id` (INTEGER PK AUTOINCREMENT), `service` (TEXT UNIQUE NOT NULL), `title` (TEXT NOT NULL), `content` (TEXT NOT NULL), `created_at` (TEXT NOT NULL DEFAULT (datetime('now')))
- **FR-006**: TODAS as consultas e mutações DEVEM utilizar Prepared Statements (`db.prepare(...)`) e passagem de parâmetros vinculados; SQL concatenado é PROIBIDO.
- **FR-007**: O método `seed()` DEVE ser idempotente e popular o cenário Mercadinho (5 serviços, 6 alertas: 3 firing, 3 resolved; runbooks para checkout, payments, auth).
- **FR-008**: O módulo `src/agents/tools.ts` DEVE exportar as ferramentas:
  - `list_alerts`: com filtro `status: 'firing' | 'resolved' | 'all'` (padrão `'firing'`).
  - `open_incident`: com campos `title`, `service`, `severity` (enum) e descrição detalhada de quando usar.
  - `resolve_incident`: com campo `id` numérico e descrição clara.
  - `list_incidents`: com filtro `status: 'open' | 'resolved' | 'all'` (padrão `'open'`).
  - `consultar_runbook`: com campo `service: string`.
- **FR-009**: Todas as ferramentas DEVEM ter `.describe()` em cada campo do schema Zod e descrições estruturadas conforme as 6 regras.
- **FR-010**: A suíte de testes DEVE executar sobre `":memory:"` cobrindo o ciclo de vida de dados, filtros, constraints `CHECK`, e todas as tools.

---

## Success Criteria *(mandatory)*

- **SC-001**: `npm test` executa 100% verde incluindo testes unitários de store e testes de ferramentas com SQLite `:memory:`.
- **SC-002**: `npm run typecheck` conclui sem erros de tipo.
- **SC-003**: 100% das queries utilizam Prepared Statements sem vulnerabilidade de injeção SQL.
- **SC-004**: Violação de constraints `CHECK` dispara erro previsível e protege o domínio de dados inválidos.
