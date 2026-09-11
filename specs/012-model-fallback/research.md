# Research: Resiliência de Modelo com Fallback e Retries

**Feature**: `012-model-fallback`  
**Date**: 2026-09-10  

---

## 1. Contexto e Problema

No OpsPilot, todas as decisões de raciocínio, ferramentas e sumarização dependem de chamadas a modelos de linguagem via OpenRouter (`OPENROUTER_MODEL`). Atualmente:
- A fábrica `createModel()` em `src/agents/model.ts` instancia um único `ChatOpenAI` sem retentativas automáticas e sem redundância de modelo.
- Se o modelo primário sofrer de rate limiting (código HTTP 429), instabilidade temporária (500, 502, 503 da OpenRouter) ou indisponibilidade prolongada, a requisição falha imediatamente com erro 500 no endpoint HTTP `/chat`.
- Não há rastreabilidade de qual modelo atendeu a requisição (`metrics.modelUsed`), nem eventos no trace indicando falhas recuperadas.

## 2. Abordagem Técnica com LangChain

### 2.1 `withRetry` no Modelo Primário
O LangChain expõe o método `.withRetry()` em classes que herdam de `Runnable` (como `ChatOpenAI`):
```typescript
const primaryWithRetry = primaryModel.withRetry({
  stopAfterAttempt: 2, // 2 tentativas no primário antes do failover
});
```
Isso lida com erros transitórios de rede ou pequenos picos de latência sem incorrer nos custos e nas discrepâncias de acionar um modelo reserva diferente.

### 2.2 `withFallbacks([reserva])` para Contingência
Caso o modelo primário esgote suas tentativas sem sucesso, o LangChain transfere a execução para o modelo reserva configurado em `OPENROUTER_MODEL_FALLBACK`:
```typescript
const resilientRunnable = primaryWithRetry.withFallbacks([fallbackModel]);
```

### 2.3 Compatibilidade com `bindTools` e `withStructuredOutput`
Nossos agentes e nós utilizam três formas de invocação do modelo retornado por `createModel()`:
1. `model.invoke(messages, options)`
2. `model.bindTools(tools, options)` (utilizado pelo ReAct e nós de ferramentas)
3. `model.withStructuredOutput(schema, options)` (utilizado pelo nó `roteador`, `reflector` e `plan-and-execute`)

Como a classe `RunnableWithFallbacks` nativa do LangChain expõe `.invoke()`, mas não disponibiliza diretamente os métodos auxiliares `.bindTools()` e `.withStructuredOutput()`, a fábrica `createModel()` deve retornar uma interface inteligente/wrapper que:
- Aplica a mesma cadeia de resiliência (`primary.bindTools(...).withRetry(...).withFallbacks([fallback.bindTools(...)])`) quando `.bindTools()` for chamado.
- Aplica a mesma cadeia de resiliência (`primary.withStructuredOutput(...).withRetry(...).withFallbacks([fallback.withStructuredOutput(...)])`) quando `.withStructuredOutput()` for chamado.
- Mantém transparência total sem necessidade de alterar as chamadas nos agentes existentes.

### 2.4 Interceptação e Observabilidade (Trace e Métricas)

Para atender aos requisitos:
- **Evento de trace `"fallback"`**: Quando o primário falha e a chamada é atendida pelo reserva, um evento de trace é emitido:
  ```typescript
  {
    kind: 'fallback',
    node: currentNodeName,
    content: `Falha no modelo primário '${primaryName}': ${errorMessage}. Acionado fallback para '${fallbackName}'.`,
    fromModel: primaryName,
    toModel: fallbackName,
    error: errorMessage,
    timestampMs: Date.now(),
  }
  ```
- **`metrics.modelUsed`**: Registra o identificador do modelo que produziu o resultado final (ex: `openrouter/free` ou o valor de `OPENROUTER_MODEL_FALLBACK`).

### 2.5 Tratamento de Esgotamento Total (HTTP 503)
Quando todos os modelos falham (primário após retries e o modelo reserva), o erro deve ser classificado como `ServiceUnavailableError` (ou identificado por exaustão de provedores de IA) e capturado no middleware do endpoint `/chat` em `src/http/server.ts`, retornando:
- **Status HTTP**: `503 Service Unavailable`
- **Corpo JSON**:
  ```json
  {
    "error": "Service Unavailable",
    "message": "Todos os modelos configurados (primário e fallback) falharam ao processar a requisição"
  }
  ```

---

## 3. Decisões Arquiteturais

| Decisão | Escolha | Justificativa |
|---|---|---|
| Quantidade de retries do primário | 2 tentativas (`stopAfterAttempt: 2`) | Evita estouro de timeout (180s) e latência excessiva para o cliente antes do failover. |
| Modelo reserva padrão no `.env` | `meta-llama/llama-3-8b-instruct:free` ou `google/gemini-2.0-flash-exp:free` | Alta taxa de disponibilidade, gratuito na OpenRouter e suporte a chamadas estruturadas e ferramentas. |
| Emissão de evento de fallback | Interceptador / Callback no Runnable ou nós executores | Garante inclusão pontual no array de traces preservando a ordenação cronológica e identificação do nó ativo. |
| Mapeamento de erro 503 | Interceptação em `src/http/server.ts` | Semântica REST padrão para clientes HTTP identificarem falha transitória de upstream de IA. |
