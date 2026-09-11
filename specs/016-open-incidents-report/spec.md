# Feature Specification: Relatório de Incidentes Abertos em Blocos de Texto

**Feature Branch**: `016-open-incidents-report`  
**Created**: 2026-09-11  
**Status**: Complete  
**Input**: User description: "Especificação de saída: Relatório de Incidentes Abertos em blocos de texto/markdown sem depender de tabelas, com ordenação por severidade e data, resumo consolidado no topo, prioridades imediatas e sinalização de duplicidades."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Apresentação em Blocos Visuais Independentes sem Tabelas Markdown (Priority: P1)

Como engenheiro de operações/SRE que acompanha incidentes via chat ou terminal, quero que a listagem de incidentes abertos seja renderizada em blocos de texto individuais separados por linhas em branco, sem recorrer a tabelas markdown, para que a leitura seja fluida e não sofra com quebras de layout decorrentes de falta de suporte a quebra de linha em células.

**Why this priority**: É a regra fundamental de visualização. Tabelas markdown frequentemente falham ou quebram a formatação em interfaces de chat de modelos LLM. Blocos garantem legibilidade consistente em qualquer cliente markdown.

**Independent Test**:
1. Executar a consulta/geração do relatório de incidentes abertos.
2. Inspecionar a saída gerada e garantir a ausência total da sintaxe de tabela markdown (`| --- | --- |`).
3. Verificar que cada incidente ocupa um bloco independente delimitado por uma linha em branco.

**Acceptance Scenarios**:
1. **Given** um conjunto de incidentes abertos retornados pelo repositório/banco,  
   **When** o relatório for formatado para o usuário,  
   **Then** cada incidente deve ser exibido em um bloco visual próprio, separado do próximo por uma linha em branco, nunca serializando múltiplos incidentes em uma mesma linha.
2. **Given** um incidente sendo exibido no bloco,  
   **When** os campos forem montados,  
   **Then** devem seguir estritamente o template:
   ```text
   {EMOJI} **#{ID} · {SEVERIDADE}** — {SERVIÇO}
   {TÍTULO}
   Criado em: {DATA/HORA}
   ```
3. **Given** as diferentes severidades cadastradas,  
   **When** o emoji correspondente for selecionado,  
   **Then** deve utilizar obrigatoriamente o mapeamento:
   - 🔴 CRITICAL
   - 🟠 HIGH
   - 🟡 MEDIUM
   - ⚪ LOW

---

### User Story 2 - Resumo Quantitativo no Topo e Ordenação Rigorosa (Priority: P1)

Como operador em plantão de produção, quero visualizar no topo do relatório um resumo quantitativo consolidado com a contagem total e por severidade, seguido de uma listagem rigorosamente ordenada da maior para a menor severidade (e, dentro da mesma severidade, pelos mais recentes primeiro), para que eu possa avaliar o impacto global em segundos.

**Why this priority**: A tomada de decisão sob pressão operacional exige métricas imediatas e priorização hierárquica clara antes da leitura dos detalhes.

**Independent Test**:
1. Contar os incidentes abertos por severidade no banco de dados.
2. Verificar se o bloco de cabeçalho no topo reflete exatamente os números apurados.
3. Verificar se a ordem dos incidentes segue estritamente `Critical > High > Medium > Low` e, em caso de empate, `created_at` decrescente.

**Acceptance Scenarios**:
1. **Given** a geração do relatório,  
   **When** o cabeçalho for renderizado,  
   **Then** deve conter o formato fixo:
   ```text
   ## Incidentes abertos em produção
   Total: {N} | Critical: {X} | High: {X} | Medium: {X} | Low: {X}
   ```
2. **Given** a contagem exibida no cabeçalho,  
   **When** confrontada com os itens listados no corpo do relatório,  
   **Then** `N` deve ser exatamente igual a `Critical + High + Medium + Low` e igual ao número de blocos exibidos.
3. **Given** dois ou mais incidentes com a mesma severidade,  
   **When** ordenados na lista,  
   **Then** o incidente criado mais recentemente deve aparecer antes dos mais antigos.

---

### User Story 3 - Destaque de Ação Imediata e Detecção de Sintomas Duplicados (Priority: P2)

Como gestor de incidentes, quero que o relatório encerre com uma seção "Prioridade imediata" citando apenas os incidentes Critical e High, e alerte explicitamente sobre suspeitas de duplicidade entre incidentes do mesmo serviço com sintomas similares, para otimizar a distribuição do time e evitar retrabalho.

**Why this priority**: Destaca os pontos de atenção críticos sem exigir a leitura manual de todos os blocos de média/baixa severidade e sinaliza alertas concorrentes.

**Independent Test**:
1. Criar dois incidentes com títulos similares no mesmo serviço (ex: alta latência de checkout).
2. Gerar o relatório e verificar a emissão do alerta de duplicidade.
3. Verificar a presença da seção `### Ação imediata` contendo exclusivamente os IDs e motivos dos incidentes Critical e High.

**Acceptance Scenarios**:
1. **Given** a existência de incidentes com severidade `critical` ou `high`,  
   **When** o final do relatório for construído,  
   **Then** deve ser inserida a seção:
   ```text
   ### Ação imediata
   - #{ID} ({SERVIÇO}) — {motivo em uma linha}
   ```
2. **Given** dois ou mais incidentes com o mesmo serviço e títulos com sintomas semelhantes,  
   **When** o relatório for gerado,  
   **Then** deve ser emitida a sinalização:
   ```text
   ⚠️ Possível duplicidade: #{ID_A} e #{ID_B} ({SERVIÇO}) — sintomas semelhantes.
   ```

---

## Edge Cases

- **Nenhum incidente aberto no momento**:
  - O resumo deve exibir `Total: 0 | Critical: 0 | High: 0 | Medium: 0 | Low: 0`.
  - O corpo do relatório deve indicar uma mensagem amigável: `Nenhum incidente aberto no momento.`
  - A seção `### Ação imediata` deve indicar `Nenhuma ação imediata pendente.`
- **Nenhum incidente Critical ou High**:
  - A lista conterá apenas Medium e Low.
  - A seção `### Ação imediata` pode ser omitida ou indicar que não há incidentes críticos/altos demandando resposta imediata.
- **Múltiplos incidentes duplicados em cadeia (3 ou mais)**:
  - O sistema deve agrupar ou listar as duplicidades identificadas com clareza: `⚠️ Possível duplicidade: #{ID_A}, #{ID_B} e #{ID_C} ({SERVIÇO}) — sintomas semelhantes.`
- **Datas com fusos ou formatos heterogêneos**:
  - Todas as datas devem ser exibidas em formato legível e padronizado (`YYYY-MM-DD HH:mm:ss` ou ISO normalizado).

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE formatar cada incidente como um bloco independente delimitado por linha em branco, proibindo serialização em linha contínua.
- **FR-002**: O sistema DEVE ordenar os incidentes obrigatoriamente por severidade (`Critical` > `High` > `Medium` > `Low`) e, havendo empate de severidade, pelo timestamp de criação mais recente primeiro (`created_at DESC`).
- **FR-003**: O sistema DEVE utilizar o emoji e tag textual fixa para cada nível de severidade:
  - `🔴 CRITICAL`
  - `🟠 HIGH`
  - `🟡 MEDIUM`
  - `⚪ LOW`
- **FR-004**: O sistema DEVE aplicar rigorosamente o template por incidente:
  ```text
  {EMOJI} **#{ID} · {SEVERIDADE}** — {SERVIÇO}
  {TÍTULO}
  Criado em: {DATA/HORA}
  ```
- **FR-005**: O sistema DEVE incluir no topo do relatório o resumo numérico consolidado:
  ```text
  ## Incidentes abertos em produção
  Total: {N} | Critical: {X} | High: {X} | Medium: {X} | Low: {X}
  ```
- **FR-006**: O sistema DEVE calcular a contagem do resumo de modo 100% fidedigno e consistente com os incidentes abertos exibidos no corpo.
- **FR-007**: O sistema DEVE incluir ao final a seção `### Ação imediata` contendo exclusivamente os incidentes de severidade `Critical` e `High` no formato:
  `- #{ID} ({SERVIÇO}) — {motivo em uma linha}`.
- **FR-008**: O sistema DEVE identificar e sinalizar explicitamente suspeitas de duplicidade quando dois ou mais incidentes compartilharem o mesmo serviço e sintomas/títulos semelhantes:
  `⚠️ Possível duplicidade: #{ID_A} e #{ID_B} ({SERVIÇO}) — sintomas semelhantes.`
- **FR-009**: O sistema NUNCA DEVE utilizar sintaxe de tabelas markdown (`| --- | --- |`) na geração deste relatório.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos incidentes no relatório são renderizados em blocos visuais separados por quebras de linha sem dependência de tabelas markdown.
- **SC-002**: A contagem numérica do topo (`Total`, `Critical`, `High`, `Medium`, `Low`) confere com precisão de 100% em relação à lista de blocos gerados e aos dados do repositório.
- **SC-003**: Incidentes com criticidade `Critical` e `High` são imediatamente visíveis na seção de ação imediata ao final, permitindo triagem rápida sem leitura do relatório completo.
- **SC-004**: Casos de sintomas duplicados no mesmo serviço são alertados explicitamente no relatório.
