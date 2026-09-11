/**
 * Testes de integração do endpoint HTTP POST /chat.
 * 100% determinísticos — executados localmente sem chamadas à rede externa ou LLM.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer } from './server.js';
import { StrategyRegistry } from '../agents/index.js';
import type { ReasoningStrategy, StrategyResult, StrategyInput } from '../agents/types.js';
import { normalizeInput } from '../agents/types.js';
import { InMemoryConversationStore } from '../store/conversation-store.js';
import { InMemoryMemoryStore } from '../memory/memory-store.js';
import { DatabaseSync } from 'node:sqlite';
import { SqliteTraceStore } from '../store/sqlite-trace-store.js';
import { HistorySummarizer, FakeSummarizer, SummarizeEvent } from '../context/summarizer.js';
import { ModelUnavailableError } from '../agents/model.js';

// ─── Mocks e Estratégias Fake Determinísticas ─────────────────────────────────

class FakeReActStrategy implements ReasoningStrategy {
  readonly name = 'react';

  async run(input: string | StrategyInput): Promise<StrategyResult> {
    const { message, history = [] } = normalizeInput(input);
    return {
      answer: `Resposta ReAct para: ${message}`,
      trace: [
        { kind: 'thought', content: 'Analisando entrada...', timestampMs: 100 },
        { kind: 'action', content: { tool: 'list_alerts', args: { status: 'firing' } }, timestampMs: 200 },
        { kind: 'observation', content: '[{"id":1,"name":"cpu_high"}]', timestampMs: 300 },
        { kind: 'answer', content: `Resposta ReAct para: ${message}`, timestampMs: 400 },
      ],
      metrics: {
        llmCalls: 2,
        latencyMs: 15,
        modelUsed: 'openrouter/free',
      },
    };
  }
}

class FakePlanAndExecuteStrategy implements ReasoningStrategy {
  readonly name = 'plan-and-execute';

  async run(input: string | StrategyInput): Promise<StrategyResult> {
    const { message } = normalizeInput(input);
    return {
      answer: `Resposta Plan-and-Execute para: ${message}`,
      trace: [
        { kind: 'plan', content: '1. Passo A\n2. Passo B', timestampMs: 100 },
        { kind: 'action', content: { tool: 'inspect_service', args: { name: 'api' } }, timestampMs: 200 },
        { kind: 'observation', content: '{"status":"ok"}', timestampMs: 300 },
        { kind: 'answer', content: `Resposta Plan-and-Execute para: ${message}`, timestampMs: 400 },
      ],
      metrics: {
        llmCalls: 3,
        latencyMs: 25,
      },
    };
  }
}

class FakeSlowStrategy implements ReasoningStrategy {
  readonly name = 'slow-strategy';

  constructor(private readonly delayMs: number) {}

  async run(input: string | StrategyInput): Promise<StrategyResult> {
    const { message } = normalizeInput(input);
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return {
      answer: `Resposta lenta para: ${message}`,
      trace: [{ kind: 'answer', content: 'Concluído tardiamente', timestampMs: 500 }],
      metrics: { llmCalls: 1, latencyMs: this.delayMs },
    };
  }
}

class FakeFallbackStrategy implements ReasoningStrategy {
  readonly name = 'fallback-strategy';

  async run(input: string | StrategyInput): Promise<StrategyResult> {
    const { message } = normalizeInput(input);
    return {
      answer: `Resposta fallback para: ${message}`,
      trace: [
        {
          kind: 'fallback',
          content: 'Primário falhou. Acionado fallback.',
          fromModel: 'openrouter/free',
          toModel: 'openrouter/deepseek-r1:free',
          error: '429 Rate limit',
          timestampMs: 150,
        },
        { kind: 'answer', content: `Resposta fallback para: ${message}`, timestampMs: 300 },
      ],
      metrics: {
        llmCalls: 2,
        latencyMs: 25,
        modelUsed: 'openrouter/deepseek-r1:free',
      },
    };
  }
}

class FakeFailingStrategy implements ReasoningStrategy {
  readonly name = 'failing-strategy';

  async run(): Promise<StrategyResult> {
    throw new ModelUnavailableError(
      'Todos os modelos configurados (primário e fallback) falharam ao processar a requisição',
      { primaryModel: 'openrouter/free', fallbackModel: 'openrouter/deepseek-r1:free' }
    );
  }
}

// ─── Setup de Servidor de Teste ───────────────────────────────────────────────

describe('POST /chat — Testes de Integração', () => {
  let server: Server;
  let baseUrl: string;
  let testRegistry: StrategyRegistry;
  let conversationStore: InMemoryConversationStore;
  let memoryStore: InMemoryMemoryStore;
  let traceStore: SqliteTraceStore;
  let fakeSummarizerClient: FakeSummarizer;
  let testSummarizer: HistorySummarizer;

  before(async () => {
    // Mock do modelo do crítico para reflection em teste sem rede
    const mockCriticModel = {
      withStructuredOutput: () => ({
        invoke: async () => ({
          approved: true,
          feedback: 'Observações suportam a resposta perfeitamente.',
        }),
      }),
    };

    // Cria registry isolado para testes com reflection determinístico
    testRegistry = new StrategyRegistry(
      {
        react: () => new FakeReActStrategy(),
        'plan-and-execute': () => new FakePlanAndExecuteStrategy(),
        slow: () => new FakeSlowStrategy(120),
        'fallback-strategy': () => new FakeFallbackStrategy(),
        'failing-strategy': () => new FakeFailingStrategy(),
      },
      { criticModel: mockCriticModel }
    );

    // Store de conversas isolado para testes
    conversationStore = new InMemoryConversationStore();

    // Store de memória semântica isolado para testes
    memoryStore = new InMemoryMemoryStore();

    // Store de trace e requests isolado para testes
    traceStore = new SqliteTraceStore(new DatabaseSync(':memory:'));

    // Summarizer fake para testes determinísticos
    fakeSummarizerClient = new FakeSummarizer();
    testSummarizer = new HistorySummarizer({
      store: conversationStore,
      client: fakeSummarizerClient,
    });

    // Mock do modelo do refletor de aprendizado para testes determinísticos sem rede
    const mockReflectorModel = {
      withStructuredOutput: () => ({
        invoke: async (messages: Array<{ role: string; content: string }>) => {
          const content = messages[1]?.content ?? '';
          if (content.includes('Thiago') || content.includes('aprender fato')) {
            return {
              hasLearning: true,
              fact: 'O usuário se chama Thiago e prefere suporte em português',
            };
          }
          return { hasLearning: false };
        },
      }),
    };

    // Mock do modelo do roteador para testes determinísticos sem rede
    const mockRouterModel = {
      withStructuredOutput: () => ({
        invoke: async () => ({
          route: 'react' as const,
          reason: 'Rota padrão determinística para testes de integração',
        }),
      }),
    };

    // Servidor de teste com timeout configurado
    const app = createServer({
      registry: testRegistry,
      timeoutMs: 500, // timeout padrão de teste
      conversationStore,
      memoryStore,
      traceStore,
      reflectorModel: mockReflectorModel,
      summarizer: testSummarizer,
      routerModel: mockRouterModel,
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ── 200 OK — Sucesso ────────────────────────────────────────────────────────

  test('200 OK com payload padrão (strategy opcional, decide react e inclui node e route no trace)', async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Listar alertas' }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      answer: string;
      trace: Array<{ kind: string; content: unknown; node?: string; route?: string }>;
      metrics: { llmCalls: number; latencyMs: number; historyMessages: number };
      conversationId: string;
    };

    assert.ok(body.answer.includes('Resposta ReAct para: Listar alertas'));
    assert.ok(Array.isArray(body.trace));
    const routeEvent = body.trace.find((e) => e.kind === 'route');
    assert.ok(routeEvent, 'Trace deve conter evento route');
    assert.equal(routeEvent?.node, 'roteador');
    assert.equal(routeEvent?.route, 'react');
    assert.ok(body.trace.every((e) => typeof e.node === 'string' && e.node.length > 0), 'Todos os eventos devem ter o campo node');
    assert.ok(body.metrics.llmCalls >= 2);
    assert.ok(body.metrics.latencyMs >= 0);
    assert.ok(body.conversationId, 'deve retornar conversationId');
    assert.equal(body.metrics.historyMessages, 0, 'nova conversa deve ter 0 historyMessages');
  });


  test('200 OK especificando strategy = plan-and-execute', async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Investigar serviço',
        strategy: 'plan-and-execute',
      }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      answer: string;
      trace: Array<{ kind: string; content: unknown }>;
      metrics: { llmCalls: number; latencyMs: number };
      conversationId: string;
    };

    assert.ok(body.answer.includes('Resposta Plan-and-Execute'));
    assert.equal(body.metrics.llmCalls, 3);
    assert.ok(body.conversationId);
  });

  test('200 OK com reflect: true aplicando withReflection e gerando critique trace', async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Auditar incidente',
        strategy: 'react',
        reflect: true,
      }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      answer: string;
      trace: Array<{ kind: string; content: string }>;
      metrics: { llmCalls: number; latencyMs: number };
      conversationId: string;
    };

    assert.ok(body.answer.includes('Resposta ReAct para: Auditar incidente'));
    const critiqueEvent = body.trace.find((e) => e.kind === 'critique');
    assert.ok(critiqueEvent, 'Trace deve conter evento critique');
    assert.ok(critiqueEvent.content.includes('[APROVADO]'));
    // 2 chamadas base + 1 chamada de critique = 3 chamadas
    assert.equal(body.metrics.llmCalls, 3);
    assert.ok(body.conversationId);
  });

  test('200 OK com strategy explícita atuando como override no trace', async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Executar plano complexo',
        strategy: 'plan-and-execute',
      }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      answer: string;
      trace: Array<{ kind: string; node?: string; route?: string; reason?: string }>;
    };

    assert.ok(body.answer.includes('Resposta Plan-and-Execute'));
    const routeEvent = body.trace.find((e) => e.kind === 'route');
    assert.ok(routeEvent, 'Deve emitir evento route');
    assert.equal(routeEvent?.node, 'roteador');
    assert.equal(routeEvent?.route, 'planExecute');
    assert.ok(routeEvent?.reason?.includes('Override manual'));
  });

  test('100% dos eventos no trace retornado pelo /chat possuem o campo node', async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Verificação de campos de trace' }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      trace: Array<{ kind: string; node?: string }>;
    };

    assert.ok(body.trace.length > 0);
    for (const ev of body.trace) {
      assert.ok(
        typeof ev.node === 'string' && ev.node.trim().length > 0,
        `Evento ${ev.kind} não possui campo node válido`
      );
    }
  });

  // ── 400 Bad Request — Validação Zod ─────────────────────────────────────────


  test('400 Bad Request quando message está ausente', async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: 'react' }),
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string; issues: Array<{ path: string[] }> };
    assert.equal(body.error, 'Invalid request body');
    assert.ok(Array.isArray(body.issues));
    assert.ok(body.issues.some((i) => i.path.includes('message')));
  });

  test('400 Bad Request quando message é vazia ou só espaços', async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string; issues: Array<{ message: string }> };
    assert.equal(body.error, 'Invalid request body');
    assert.ok(body.issues.some((i) => i.message.includes('A mensagem não pode ser vazia')));
  });

  test('400 Bad Request quando reflect tem tipo inválido (não-booleano)', async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Teste', reflect: 'sim' }),
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string; issues: Array<{ path: string[] }> };
    assert.equal(body.error, 'Invalid request body');
    assert.ok(body.issues.some((i) => i.path.includes('reflect')));
  });

  test('400 Bad Request quando JSON é malformado', async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"message": "Incompleto...',
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, 'Invalid JSON payload');
  });

  test('400 Bad Request quando conversationId não é UUID válido', async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Teste', conversationId: 'nao-e-uuid' }),
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string; issues: Array<{ path: string[]; message: string }> };
    assert.equal(body.error, 'Invalid request body');
    assert.ok(body.issues.some((i) => i.path.includes('conversationId')));
  });

  // ── 404 Not Found — Conversa Inexistente ────────────────────────────────────

  test('404 Not Found quando conversationId UUID válido não existe', async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Teste',
        conversationId: '00000000-0000-4000-a000-000000000000',
      }),
    });

    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string; conversationId: string };
    assert.equal(body.error, 'Conversation not found');
    assert.equal(body.conversationId, '00000000-0000-4000-a000-000000000000');
  });

  // ── 422 Unprocessable Entity — Estratégia Desconhecida ───────────────────────

  test('422 Unprocessable Entity quando strategy não está registrada', async () => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Teste', strategy: 'estrategia-desconhecida' }),
    });

    assert.equal(response.status, 422);
    const body = (await response.json()) as { error: string; availableStrategies: string[] };
    assert.equal(body.error, 'Unknown strategy: estrategia-desconhecida');
    assert.ok(Array.isArray(body.availableStrategies));
    assert.ok(body.availableStrategies.includes('react'));
    assert.ok(body.availableStrategies.includes('plan-and-execute'));
  });

  // ── 504 Gateway Timeout ─────────────────────────────────────────────────────

  test('504 Gateway Timeout quando a execução excede o tempo limite configurado', async () => {
    // Servidor específico com timeout ultracurto (40ms) para testar 504
    const shortTimeoutApp = createServer({
      registry: testRegistry,
      timeoutMs: 40,
      conversationStore: new InMemoryConversationStore(),
    });

    const shortServer = await new Promise<Server>((resolve) => {
      const s = shortTimeoutApp.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const address = shortServer.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Operação pesada', strategy: 'slow' }),
      });

      assert.equal(response.status, 504);
      const body = (await response.json()) as { error: string };
      assert.equal(body.error, 'Request timed out');
    } finally {
      await new Promise<void>((resolve, reject) => {
        shortServer.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  // ── Conversa Persistente ────────────────────────────────────────────────────

  test('conversationId é retornado em nova conversa e pode ser reutilizado', async () => {
    // 1ª requisição — cria conversa
    const res1 = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Primeira pergunta' }),
    });

    assert.equal(res1.status, 200);
    const body1 = (await res1.json()) as {
      conversationId: string;
      metrics: { historyMessages: number };
    };
    assert.ok(body1.conversationId, 'deve retornar conversationId');
    assert.equal(body1.metrics.historyMessages, 0, 'primeira mensagem sem histórico');

    // 2ª requisição — continua conversa
    const res2 = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Segunda pergunta',
        conversationId: body1.conversationId,
      }),
    });

    assert.equal(res2.status, 200);
    const body2 = (await res2.json()) as {
      conversationId: string;
      metrics: { historyMessages: number };
    };
    assert.equal(body2.conversationId, body1.conversationId, 'deve manter o mesmo conversationId');
    // Após a 1ª interação: 1 user + 1 assistant = 2 mensagens no histórico
    assert.equal(body2.metrics.historyMessages, 2, 'segunda mensagem deve ter 2 no histórico');
  });

  test('historyMessages reflete o número correto de mensagens de histórico', async () => {
    // Cria conversa e faz 3 interações seguidas
    const res1 = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Msg 1' }),
    });
    const body1 = (await res1.json()) as { conversationId: string };
    const convId = body1.conversationId;

    const res2 = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Msg 2', conversationId: convId }),
    });
    const body2 = (await res2.json()) as { metrics: { historyMessages: number } };
    assert.equal(body2.metrics.historyMessages, 2, '1ª interação = 2 mensagens');

    const res3 = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Msg 3', conversationId: convId }),
    });
    const body3 = (await res3.json()) as { metrics: { historyMessages: number } };
    assert.equal(body3.metrics.historyMessages, 4, '2ª interação = 4 mensagens (2 user + 2 assistant)');
  });

  // ── Testes de Memória Semântica e userId ──────────────────────────────────────

  test('400 Bad Request quando userId é fornecido como string vazia', async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Olá', userId: '   ' }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string; issues: Array<{ path: string[] }> };
    assert.equal(body.error, 'Invalid request body');
    assert.ok(body.issues.some((issue) => issue.path.includes('userId')));
  });

  test('injeta memórias semânticas relevantes no prompt quando userId é fornecido', async () => {
    const testUser = 'user-test-memory';
    await memoryStore.remember(testUser, 'O usuário é especialista no microserviço auth');
    await memoryStore.remember(testUser, 'O usuário prefere respostas em tópicos');

    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'quem cuida do serviço de autenticação?',
        userId: testUser,
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      answer: string;
      metrics: { recalledMemories: number };
    };

    assert.ok(body.metrics.recalledMemories >= 1, 'Deve registrar memórias recuperadas nas métricas');
    assert.ok(body.answer.includes('[Memórias do Usuário]'), 'A estratégia fake deve refletir a mensagem com memórias');
    assert.ok(body.answer.includes('especialista no microserviço auth'));
  });

  test('recalledMemories é 0 quando o usuário não possui memórias correspondentes', async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'receita de bolo de cenoura',
        userId: 'user-sem-memorias',
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { metrics: { recalledMemories: number } };
    assert.equal(body.metrics.recalledMemories, 0);
  });

  test('dispara refletor de aprendizado em background persistindo novo fato', async () => {
    const testUser = 'user-auto-learning';
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'me chame de Thiago e vamos aprender fato novo',
        userId: testUser,
      }),
    });

    assert.equal(res.status, 200);

    // Aguarda conclusão assíncrona da persistência em segundo plano
    await new Promise((resolve) => setTimeout(resolve, 50));

    const memories = await memoryStore.list(testUser);
    assert.equal(memories.length, 1);
    assert.ok(memories[0].fact.includes('Thiago'));
  });

  // ── Testes de Medição de Contexto e Tokens ────────────────────────────────────

  test('retorna métricas promptTokens e contextBreakdown por fonte na resposta', async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Mensagem de teste para medição de tokens' }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      metrics: {
        promptTokens: number;
        contextBreakdown: {
          userMessage: number;
          history: number;
          memories: number;
          totalEstimated: number;
        };
      };
    };

    assert.ok(typeof body.metrics.promptTokens === 'number' && body.metrics.promptTokens > 0);
    assert.ok(body.metrics.contextBreakdown, 'contextBreakdown deve estar presente');
    assert.ok(body.metrics.contextBreakdown.userMessage > 0);
    assert.equal(body.metrics.contextBreakdown.history, 0, 'sem histórico no turno inicial');
    assert.equal(body.metrics.contextBreakdown.memories, 0, 'sem memórias sem userId');
    assert.equal(
      body.metrics.contextBreakdown.totalEstimated,
      body.metrics.contextBreakdown.userMessage
    );
  });

  test('contextBreakdown.history cresce conforme a conversa acumula turnos', async () => {
    // Turno 1
    const res1 = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Primeiro turno com pergunta curta' }),
    });
    const body1 = (await res1.json()) as {
      conversationId: string;
      metrics: { contextBreakdown: { history: number } };
    };
    const convId = body1.conversationId;
    assert.equal(body1.metrics.contextBreakdown.history, 0);

    // Turno 2
    const res2 = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Segundo turno subsequente', conversationId: convId }),
    });
    const body2 = (await res2.json()) as {
      metrics: { contextBreakdown: { history: number } };
    };
    assert.ok(body2.metrics.contextBreakdown.history > 0, 'Turno 2 deve conter tokens do turno 1 no histórico');

    // Turno 3
    const res3 = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Terceiro turno da mesma conversa', conversationId: convId }),
    });
    const body3 = (await res3.json()) as {
      metrics: { contextBreakdown: { history: number } };
    };
    assert.ok(
      body3.metrics.contextBreakdown.history > body2.metrics.contextBreakdown.history,
      'Histórico do turno 3 deve ser maior que o do turno 2'
    );
  });

  // ── Testes de Poda de Histórico e Sumarização (009) ───────────────────────────

  test('mantém janela de histórico limitada a no máximo 8 mensagens recentes', async () => {
    // Cria conversa inicial
    const resInit = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Msg 1' }),
    });
    const bodyInit = (await resInit.json()) as { conversationId: string };
    const convId = bodyInit.conversationId;

    // Envia mais 9 turnos (total 10 turnos = 20 mensagens)
    for (let i = 2; i <= 10; i++) {
      const res = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Msg ${i}`, conversationId: convId }),
      });
      const data = (await res.json()) as { metrics: { historyMessages: number } };
      // O histórico passado ao agente nunca deve ultrapassar 8 mensagens
      assert.ok(
        data.metrics.historyMessages <= 8,
        `histórico recente deve ter no máximo 8 mensagens (atual: ${data.metrics.historyMessages})`
      );
    }
  });

  test('dispara sumarização em lote ao atingir 16 mensagens, emitindo summarize e injetando no contextBreakdown', async () => {
    let summarizeEventFired = false;
    let eventData: SummarizeEvent | null = null;

    testSummarizer.on('summarize', (e) => {
      summarizeEventFired = true;
      eventData = e;
    });

    // Turno 1
    const res1 = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Turno 1 - Decisão: investigar fila de billing' }),
    });
    const convId = ((await res1.json()) as { conversationId: string }).conversationId;

    // Turnos 2 a 7 (totalizando 14 mensagens no banco)
    for (let i = 2; i <= 7; i++) {
      await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Turno ${i}`, conversationId: convId }),
      });
    }

    // Até o turno 7 (14 mensagens), nenhuma sumarização ocorreu (precisa de 16 mensagens = 8 fora da janela de 8)
    assert.equal(summarizeEventFired, false, 'não deve sumarizar antes de 8 mensagens saírem da janela');

    // Turno 8 (completa 16 mensagens no store -> 8 saíram da janela de 8 recentes)
    const res8 = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Turno 8 - Fechando lote de 16 mensagens', conversationId: convId }),
    });
    assert.equal(res8.status, 200);

    // Agora o evento summarize deve ter sido emitido!
    assert.equal(summarizeEventFired, true, 'deve emitir evento summarize ao completar 16 mensagens');
    assert.ok(eventData);
    const evt: SummarizeEvent = eventData;
    assert.equal(evt.conversationId, convId);
    assert.equal(evt.messagesSummarized, 8);

    // Turno 9: Agora o resumo gravado entra no contexto do chat!
    const res9 = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Turno 9 - Verifique as pendências', conversationId: convId }),
    });
    const body9 = (await res9.json()) as {
      answer: string;
      metrics: {
        contextBreakdown: {
          summary: number;
          history: number;
          userMessage: number;
          totalEstimated: number;
        };
      };
    };

    // A resposta fake do ReAct reflete o promptMessage recebido
    assert.ok(body9.answer.includes('[Resumo da Conversa Anterior]'), 'Resumo deve ser injetado no prompt');
    assert.ok(body9.metrics.contextBreakdown.summary > 0, 'contextBreakdown.summary deve ser > 0');
    assert.equal(
      body9.metrics.contextBreakdown.totalEstimated,
      body9.metrics.contextBreakdown.userMessage +
        body9.metrics.contextBreakdown.history +
        body9.metrics.contextBreakdown.summary
    );
  });

  // ── Testes de Resiliência de Modelo e Fallback (012) ─────────────────────────

  test('POST /chat retorna metrics.modelUsed na resposta de sucesso', async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Qual o status do serviço?' }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      metrics: { modelUsed?: string };
    };

    assert.ok(body.metrics.modelUsed, 'modelUsed deve estar presente em metrics');
    assert.equal(body.metrics.modelUsed, 'openrouter/free');
  });

  test('POST /chat retorna trace com evento fallback e modelUsed do reserva em caso de failover', async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Executar com contingência',
        strategy: 'fallback-strategy',
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      trace: Array<{ kind: string; fromModel?: string; toModel?: string; error?: string }>;
      metrics: { modelUsed?: string };
    };

    assert.equal(body.metrics.modelUsed, 'openrouter/deepseek-r1:free');
    const fallbackEvent = body.trace.find((e) => e.kind === 'fallback');
    assert.ok(fallbackEvent, 'Trace deve conter evento do tipo fallback');
    assert.equal(fallbackEvent.fromModel, 'openrouter/free');
    assert.equal(fallbackEvent.toModel, 'openrouter/deepseek-r1:free');
  });

  test('POST /chat retorna 503 Service Unavailable quando todos os modelos falham', async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Executar com falha total',
        strategy: 'failing-strategy',
      }),
    });

    assert.equal(res.status, 503);
    const body = (await res.json()) as {
      error: string;
      message: string;
    };

    assert.equal(body.error, 'Service Unavailable');
    assert.ok(
      body.message.includes('Todos os modelos') || body.message.includes('falharam'),
      'Mensagem deve indicar falha dos modelos'
    );
  });

  // ── Testes de Rastreabilidade e Persistência de Trace (Feature 013) ────────

  test('POST /chat gera requestId no corpo e no header X-Request-Id quando ausente', async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Olá sem id pré-definido' }),
    });

    assert.equal(res.status, 200);
    const headerId = res.headers.get('x-request-id');
    assert.ok(headerId, 'Header X-Request-Id deve estar presente na resposta');

    const body = (await res.json()) as { requestId: string; answer: string };
    assert.ok(body.requestId, 'Corpo JSON deve conter requestId');
    assert.equal(body.requestId, headerId);
  });

  test('POST /chat preserva header X-Request-Id customizado no corpo e na resposta', async () => {
    const customId = 'req-customizado-456';
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': customId,
      },
      body: JSON.stringify({ message: 'Mensagem com id customizado' }),
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-request-id'), customId);

    const body = (await res.json()) as { requestId: string };
    assert.equal(body.requestId, customId);
  });

  test('POST /chat persiste requisição com métricas e trace_events em SQLite', async () => {
    const customId = 'req-persist-789';
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': customId,
      },
      body: JSON.stringify({ message: 'Verificar status do gateway' }),
    });

    assert.equal(res.status, 200);

    const saved = traceStore.getRequest(customId);
    assert.ok(saved, 'Requisição deve ter sido gravada no traceStore');
    assert.equal(saved.request.id, customId);
    assert.equal(saved.request.statusCode, 200);
    assert.equal(saved.request.status, 'ok');
    assert.ok(saved.trace.length > 0, 'Eventos de trace devem ter sido gravados');

    // Validar ordenação estrita por seq
    for (let i = 0; i < saved.trace.length; i++) {
      assert.equal(saved.trace[i].seq, i + 1);
    }
  });

  test('GET /requests/:id retorna registro e trace ordenado para id existente', async () => {
    const customId = 'req-diagnostico-101';
    await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': customId,
      },
      body: JSON.stringify({ message: 'Teste de auditoria' }),
    });

    const res = await fetch(`${baseUrl}/requests/${customId}`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as {
      request: { id: string; statusCode: number; status: string };
      trace: Array<{ seq: number; node: string; kind: string }>;
    };

    assert.equal(data.request.id, customId);
    assert.equal(data.request.statusCode, 200);
    assert.ok(Array.isArray(data.trace));
    assert.ok(data.trace.length > 0);
    assert.equal(data.trace[0].seq, 1);
  });

  test('GET /requests/:id retorna 404 para id inexistente', async () => {
    const res = await fetch(`${baseUrl}/requests/id-que-definitivamente-nao-existe`);
    assert.equal(res.status, 404);

    const body = (await res.json()) as { error: string; requestId: string };
    assert.equal(body.error, 'Request not found');
    assert.equal(body.requestId, 'id-que-definitivamente-nao-existe');
  });

  test('POST /chat com erro persiste requisição com status de erro na traceStore', async () => {
    const errorReqId = 'req-fail-503';
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': errorReqId,
      },
      body: JSON.stringify({
        message: 'Executar com falha total',
        strategy: 'failing-strategy',
      }),
    });

    assert.equal(res.status, 503);

    const record = traceStore.requests.getById(errorReqId);
    assert.ok(record, 'Requisição com erro deve ser persistida');
    assert.equal(record.id, errorReqId);
    assert.equal(record.statusCode, 503);
    assert.equal(record.status, 'error');
  });

  // ── Testes do GET /stats ──────────────────────────────────────────────────

  test('GET /stats retorna estrutura completa com since=24h (padrão)', async () => {
    const res = await fetch(`${baseUrl}/stats`);
    assert.equal(res.status, 200);

    const body = await res.json() as {
      since: string;
      total: number;
      errors: number;
      errorRate: number;
      totalTokens: number;
      estimatedCost: number;
      avgLatencyMs: number;
      p50LatencyMs: number;
      p95LatencyMs: number;
      byRoute: Array<{ route: string; total: number }>;
      byModel: Array<{ model: string; total: number }>;
    };

    // Campos obrigatórios presentes
    assert.equal(typeof body.since, 'string');
    assert.equal(typeof body.total, 'number');
    assert.equal(typeof body.errors, 'number');
    assert.equal(typeof body.errorRate, 'number');
    assert.equal(typeof body.totalTokens, 'number');
    assert.equal(typeof body.estimatedCost, 'number');
    assert.equal(typeof body.avgLatencyMs, 'number');
    assert.equal(typeof body.p50LatencyMs, 'number');
    assert.equal(typeof body.p95LatencyMs, 'number');
    assert.ok(Array.isArray(body.byRoute));
    assert.ok(Array.isArray(body.byModel));

    // Deve ter pelo menos as requisições feitas nos testes anteriores
    assert.ok(body.total > 0, `total deve ser > 0, obteve ${body.total}`);
  });

  test('GET /stats contabiliza erros e calcula errorRate', async () => {
    // Insere uma requisição diretamente para garantir dados determinísticos
    traceStore.requests.save({
      id: 'stats-test-ok-1',
      route: 'react',
      modelUsed: 'test-model:free',
      statusCode: 200,
      status: 'ok',
      latencyMs: 100,
      promptTokens: 50,
    });
    traceStore.requests.save({
      id: 'stats-test-err-1',
      route: 'react',
      modelUsed: 'test-model:free',
      statusCode: 503,
      status: 'error',
      latencyMs: 200,
      promptTokens: 30,
    });

    const res = await fetch(`${baseUrl}/stats?since=1h`);
    assert.equal(res.status, 200);

    const body = await res.json() as {
      total: number;
      errors: number;
      errorRate: number;
      estimatedCost: number;
    };

    assert.ok(body.errors >= 1, `errors deve ser >= 1, obteve ${body.errors}`);
    assert.ok(body.errorRate > 0, `errorRate deve ser > 0, obteve ${body.errorRate}`);
    // estimatedCost deve ser um número válido (modelos :free contribuem $0, outros podem gerar custo)
    assert.equal(typeof body.estimatedCost, 'number');
    assert.ok(body.estimatedCost >= 0, 'estimatedCost deve ser >= 0');
  });

  test('GET /stats retorna 400 para since inválido', async () => {
    const res = await fetch(`${baseUrl}/stats?since=banana`);
    assert.equal(res.status, 400);

    const body = await res.json() as { error: string };
    assert.ok(body.error.includes('Invalid'));
  });

  test('GET /stats retorna breakdowns por rota e modelo', async () => {
    const res = await fetch(`${baseUrl}/stats?since=24h`);
    assert.equal(res.status, 200);

    const body = await res.json() as {
      byRoute: Array<{
        route: string;
        total: number;
        errors: number;
        totalTokens: number;
        avgLatencyMs: number;
        p50LatencyMs: number;
        p95LatencyMs: number;
      }>;
      byModel: Array<{
        model: string;
        total: number;
        errors: number;
        totalTokens: number;
        avgLatencyMs: number;
      }>;
    };

    // Deve ter pelo menos uma rota (react) e um modelo
    assert.ok(body.byRoute.length > 0, 'byRoute deve ter pelo menos 1 entrada');
    assert.ok(body.byModel.length > 0, 'byModel deve ter pelo menos 1 entrada');

    // Cada entrada de rota deve ter campos de percentis
    const routeEntry = body.byRoute[0];
    assert.equal(typeof routeEntry.route, 'string');
    assert.equal(typeof routeEntry.total, 'number');
    assert.equal(typeof routeEntry.p50LatencyMs, 'number');
    assert.equal(typeof routeEntry.p95LatencyMs, 'number');

    // Cada entrada de modelo deve ter campos esperados
    const modelEntry = body.byModel[0];
    assert.equal(typeof modelEntry.model, 'string');
    assert.equal(typeof modelEntry.total, 'number');
    assert.equal(typeof modelEntry.totalTokens, 'number');
  });

  test('CORS: responde 204 No Content para preflight OPTIONS com headers apropriados', async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, X-Request-Id',
      },
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.ok(res.headers.get('access-control-allow-methods')?.includes('POST'));
    assert.ok(res.headers.get('access-control-allow-headers')?.includes('X-Request-Id'));
    assert.ok(res.headers.get('access-control-expose-headers')?.includes('X-Request-Id'));
  });

  test('CORS: inclui header Access-Control-Allow-Origin em respostas normais', async () => {
    const res = await fetch(`${baseUrl}/requests/123`, {
      headers: {
        Origin: 'http://localhost:5173',
      },
    });

    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.equal(res.headers.get('access-control-expose-headers'), 'X-Request-Id');
  });
});


