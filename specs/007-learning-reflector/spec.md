# Feature Specification: Refletor de Aprendizado & Tool `forget_preference`

**Feature Branch**: `007-learning-reflector`  
**Created**: 2026-09-09  
**Status**: Draft  
**Input**: User description: "Refletor de aprendizado: após cada resposta, um withStructuredOutput({ hasLearning, fact }) lê a ultima mensagem do usuário e destila fatos duráveis (nunca pedido pontual, nunca segredo) -> memories.remember assíncrono; tool forget_preference"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Destilação Automática de Fatos Duráveis com `withStructuredOutput` (Priority: P1)

Como operador do OpsPilot, quero que o sistema aprenda minhas preferências operacionais e informações duráveis automaticamente a partir das minhas mensagens, para que eu não precise configurá-las manualmente nem repetir minhas preferências a cada conversa.

**Why this priority**: Permite que a memória semântica seja populada de forma transparente e autônoma, sem exigir comandos explícitos de cadastro de preferências.

**Independent Test**: Testável isoladamente com mock do LLM estruturado (`withStructuredOutput`):
1. Mensagem `"Meu nome é Thiago e sou o tech lead do serviço auth"` $\rightarrow$ `hasLearning: true`, `fact: "O usuário se chama Thiago e é o tech lead do serviço auth"`.
2. Mensagem `"Abra um incidente low no checkout agora"` $\rightarrow$ `hasLearning: false` (pedido pontual descartado).
3. Mensagem `"Minha chave secreta da AWS é AKIAIOSFODNN7EXAMPLE"` $\rightarrow$ `hasLearning: false` (segredo descartado estritamente).

**Acceptance Scenarios**:
1. **Given** a mensagem do usuário contendo uma preferência durável (`"Prefiro receber relatórios em formato resumido em tópicos"`),  
   **When** o refletor de aprendizado processa a mensagem,  
   **Then** extrai `{ hasLearning: true, fact: "O usuário prefere relatórios resumidos em tópicos" }`.

2. **Given** a mensagem do usuário contendo um pedido pontual operacional (`"verifique se o github está fora do ar"` ou `"liste os alertas disparando"`),  
   **When** o refletor processa a mensagem,  
   **Then** retorna `{ hasLearning: false }`, descartando o pedido sem gerar memória.

3. **Given** a mensagem contendo segredos, senhas, tokens ou credenciais (`"meu token da API é sk-proj-123456"`),  
   **When** o refletor processa a mensagem,  
   **Then** o guardrail instrui a NUNCA persistir segredos, retornando `{ hasLearning: false }`.

---

### User Story 2 - Persistência Assíncrona Fire-and-Forget no `/chat` (Priority: P1)

Como usuário da API `/chat`, quero que o aprendizado do refletor ocorra de forma assíncrona em segundo plano, para que o tempo de resposta da minha requisição HTTP não seja penalizado pelo processo de reflexão e embedding.

**Why this priority**: Preserva a baixa latência percebida pelo cliente HTTP ao mesmo tempo em que enriquece a base de memória em segundo plano.

**Independent Test**: Testável enviando requisição `POST /chat` com `userId`: o endpoint responde 200 OK imediatamente após a geração da resposta pelo agente, disparando o refletor em background que invoca `memoryStore.remember(userId, fact)`.

**Acceptance Scenarios**:
1. **Given** uma requisição `POST /chat` com `userId: "user-1"`,  
   **When** a resposta do agente é gerada e enviada via HTTP 200,  
   **Then** a tarefa de reflexão de aprendizado roda em segundo plano e, detectando aprendizado, executa `memoryStore.remember("user-1", fact)`.

2. **Given** uma falha ou rejeição no processo assíncrono de reflexão (ex: timeout no LLM ou erro transitório),  
   **When** o erro ocorre em background,  
   **Then** o erro é capturado e registrado em log (`console.error`), sem causar unhandled rejection nem interromper a execução do processo Node.

3. **Given** uma requisição sem `userId`,  
   **When** o `/chat` conclui,  
   **Then** o refletor de aprendizado não é disparado (aprendizado é estritamente associado a um usuário identificado).

---

### User Story 3 - Tool de Agente `forget_preference` (Priority: P1)

Como usuário, quero poder pedir ao agente em linguagem natural que esqueça uma preferência cadastrada (ex: `"esqueça que prefiro tópicos"` ou `"esqueça minha preferência de horário"`), para que o agente utilize a tool `forget_preference` e remova o fato semântico correspondente.

**Why this priority**: Dá ao usuário o controle explícito sobre o que a IA lembra ou esquece (princípio de controle e privacidade de dados / right to be forgotten).

**Independent Test**: Testável invocando a tool `forget_preference` com `{ query: "tópicos" }` para um usuário que possuía o fato `"O usuário prefere resumos em tópicos"`; a tool localiza a memória por recall semântico e a exclui via `memoryStore.forget(userId, memory.id)`, retornando confirmação estruturada.

**Acceptance Scenarios**:
1. **Given** um usuário com a memória `"O usuário prefere relatórios em formato de tópicos"`,  
   **When** a tool `forget_preference` é executada com `{ query: "formato de tópicos" }`,  
   **Then** realiza um recall para localizar a memória mais relevante e chama `memoryStore.forget(userId, memory.id)`, retornando mensagem de sucesso contendo o fato esquecido.

2. **Given** uma busca na tool `forget_preference` que não encontra memórias relevantes (score $< 0.3$),  
   **When** a tool é executada,  
   **Then** retorna mensagem informativa indicando que nenhuma preferência correspondente foi encontrada para esquecer.

3. **Given** passagem direta de `memoryId` opcional na tool,  
   **When** `forget_preference` é executada com `{ memoryId: 12 }`,  
   **Then** executa diretamente a exclusão por ID e retorna o resultado.

---

## Edge Cases

- **Mensagem com múltiplos pedidos e uma preferência**: Ex: `"abra um low no auth e me chame de Thiago"`. O refletor deve ignorar o pedido pontual ("abra um low no auth") e destilar apenas o fato durável ("O nome do usuário é Thiago").
- **Fato repetido / já conhecido**: O `memoryStore.remember` já possui deduplicação intrínseca ($\ge 0.92$), evitando duplicatas mesmo que o usuário repita a preferência.
- **Detecção de segredos**: Prompts com padrões de credenciais (senhas, api keys, tokens, bearer) devem ser categoricamente ignorados pelo refletor (`hasLearning: false`).
- **Execução concorrente de múltiplos chats do mesmo usuário**: O SQLite em modo síncrono com prepared statements lida com inserções sequenciadas sem colisão.
- **Desativação em modo sem LLM (Testes determinísticos)**: O refletor deve aceitar um modelo customizado injetável via opções do servidor para testes determinísticos sem rede.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE fornecer o schema Zod e tipo estruturado para o aprendizado em `src/memory/reflector.ts`:
  ```typescript
  export const LearningSchema = z.object({
    hasLearning: z.boolean().describe('Indica se há um fato durável a ser memorizado sobre o usuário'),
    fact: z
      .string()
      .optional()
      .describe('Fato durável conciso em terceira pessoa (ex: "O usuário é o tech lead do auth"). NUNCA incluir pedidos pontuais nem segredos.'),
  });

  export type LearningResult = z.infer<typeof LearningSchema>;
  ```

- **FR-002**: O sistema DEVE fornecer a função `reflectLearning`:
  ```typescript
  export async function reflectLearning(
    userMessage: string,
    model?: ReturnType<typeof createModel>
  ): Promise<LearningResult>;
  ```
  Com system prompt específico que instrui:
  - Destilar **apenas** fatos duráveis (preferências, papéis, contexto permanente do operador).
  - **PROIBIDO** memorizar pedidos pontuais de execução (alertas, incidentes, runbooks, checagem de status, comandos imediatos).
  - **PROIBIDO** memorizar segredos (chaves, senhas, tokens, credenciais).

- **FR-003**: No endpoint `POST /chat` em `src/http/server.ts`:
  - Após a resposta ser enviada (ou imediatamente após a geração da resposta), se `userId` e `memoryStore` estiverem presentes, dispara de forma assíncrona:
    ```typescript
    void (async () => {
      try {
        const learning = await reflectLearning(message, reflectorModel);
        if (learning.hasLearning && learning.fact) {
          await memoryStore.remember(userId, learning.fact);
        }
      } catch (err) {
        console.error('Erro no refletor de aprendizado em background:', err);
      }
    })();
    ```

- **FR-004**: O sistema DEVE fornecer a tool `forget_preference` em `src/memory/memory-tools.ts` ou `src/agents/tools.ts`:
  - Schema de entrada:
    ```typescript
    export const forgetPreferenceSchema = z.object({
      query: z
        .string()
        .min(1)
        .describe('Termo ou descrição da preferência ou fato que o usuário deseja esquecer (ex: "preferência de alertas no slack", "meu nome")'),
      memoryId: z
        .number()
        .optional()
        .describe('ID numérico da memória específico caso conhecido'),
    });
    ```
  - Execução:
    - Se `memoryId` for informado: chama `memoryStore.forget(userId, memoryId)`.
    - Se `query` for informada: chama `memoryStore.recall(userId, query, 1, 0.3)`. Se encontrar, chama `memoryStore.forget(userId, found.id)` e retorna mensagem confirmando o esquecimento do fato. Se não encontrar, informa que nenhuma preferência similar foi localizada.

- **FR-005**: A tool `forget_preference` DEVE ser integrada ao conjunto de ferramentas disponíveis para o agente (`opsTools` ou tools com contexto do usuário).

- **FR-006**: O servidor HTTP `ServerOptions` DEVE permitir configurar `reflectorModel` opcional para permitir testes 100% determinísticos sem rede externa.

---

### Key Entities & Contracts

- **`LearningSchema`**:
  ```typescript
  export const LearningSchema = z.object({
    hasLearning: z.boolean(),
    fact: z.string().optional(),
  });
  ```

- **Tool `forget_preference`**:
  - Nome: `forget_preference`
  - Descrição: `Esquece ou apaga uma preferência, fato ou informação previamente memorizada sobre o usuário no sistema. Use quando o usuário pedir para esquecer, apagar ou desconsiderar uma preferência anterior.`
  - Schema: `{ query: string, memoryId?: number }`

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O refletor de aprendizado extrai fatos duráveis ignorando 100% dos pedidos operacionais pontuais em testes automatizados.
- **SC-002**: O refletor ignora estritamente segredos e credenciais informadas pelo usuário (`hasLearning: false`).
- **SC-003**: A persistência em background com `memoryStore.remember` é executada de forma não bloqueante para a resposta HTTP.
- **SC-004**: A tool `forget_preference` localiza semanticamente e remove a memória alvo do usuário com isolamento garantido.
- **SC-005**: Suíte de testes (`npm test`) e checagem de tipos (`npm run typecheck`) executam com 100% de sucesso determinístico.
