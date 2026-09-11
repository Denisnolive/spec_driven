import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SqliteTraceStore } from './sqlite-trace-store.js';
import type { TraceEvent } from '../agents/types.js';

describe('SqliteTraceStore', () => {
  function createInMemoryStore(): SqliteTraceStore {
    const db = new DatabaseSync(':memory:');
    return new SqliteTraceStore(db);
  }

  test('deve inicializar tabelas requests e trace_events sem erros', () => {
    const store = createInMemoryStore();
    assert.ok(store);
    assert.ok(store.requests);
    assert.ok(store.traceEvents);
  });

  test('deve salvar e buscar uma requisição por ID', () => {
    const store = createInMemoryStore();
    const requestId = 'req-test-123';

    store.requests.save({
      id: requestId,
      conversationId: 'conv-abc',
      userId: 'user-ops-1',
      message: 'Qual é o status do pagamento?',
      answer: 'Todos os serviços de pagamento operam normalmente.',
      route: 'react',
      statusCode: 200,
      status: 'ok',
      latencyMs: 350,
      llmCalls: 1,
      modelUsed: 'openai/gpt-4o-mini',
      promptTokens: 120,
      completionTokens: 45,
      totalTokens: 165,
    });

    const record = store.requests.getById(requestId);
    assert.ok(record);
    assert.equal(record.id, requestId);
    assert.equal(record.conversationId, 'conv-abc');
    assert.equal(record.userId, 'user-ops-1');
    assert.equal(record.message, 'Qual é o status do pagamento?');
    assert.equal(record.answer, 'Todos os serviços de pagamento operam normalmente.');
    assert.equal(record.route, 'react');
    assert.equal(record.statusCode, 200);
    assert.equal(record.status, 'ok');
    assert.equal(record.latencyMs, 350);
    assert.equal(record.llmCalls, 1);
    assert.equal(record.modelUsed, 'openai/gpt-4o-mini');
    assert.equal(record.promptTokens, 120);
    assert.equal(record.completionTokens, 45);
    assert.equal(record.totalTokens, 165);
    assert.ok(record.createdAt);
  });

  test('deve salvar e listar eventos de trace ordenados por seq', () => {
    const store = createInMemoryStore();
    const requestId = 'req-trace-order';

    store.requests.save({
      id: requestId,
      conversationId: 'conv-1',
      statusCode: 200,
      status: 'ok',
    });

    // Inserir eventos fora de ordem para validar ordenação
    store.traceEvents.save({
      requestId,
      seq: 2,
      node: 'react',
      kind: 'action',
      type: 'action',
      payload: { tool: 'get_service_status', args: { service: 'payment' } },
      timestampMs: 1000200,
    });

    store.traceEvents.save({
      requestId,
      seq: 1,
      node: 'roteador',
      kind: 'route',
      type: 'route',
      payload: 'Roteado para react',
      timestampMs: 1000100,
    });

    store.traceEvents.save({
      requestId,
      seq: 3,
      node: 'resposta',
      kind: 'answer',
      type: 'answer',
      payload: 'Concluído com sucesso',
      timestampMs: 1000300,
    });

    const events = store.traceEvents.listByRequestId(requestId);
    assert.equal(events.length, 3);
    assert.equal(events[0].seq, 1);
    assert.equal(events[0].node, 'roteador');
    assert.equal(events[0].kind, 'route');
    assert.equal(events[0].payload, 'Roteado para react');

    assert.equal(events[1].seq, 2);
    assert.equal(events[1].node, 'react');
    assert.equal(events[1].kind, 'action');
    assert.deepEqual(events[1].payload, {
      tool: 'get_service_status',
      args: { service: 'payment' },
    });

    assert.equal(events[2].seq, 3);
    assert.equal(events[2].node, 'resposta');
    assert.equal(events[2].kind, 'answer');
    assert.equal(events[2].payload, 'Concluído com sucesso');
  });

  test('deve salvar requisição e trace completo com saveRequest e recuperar com getRequest', () => {
    const store = createInMemoryStore();
    const requestId = 'req-full-save';

    const trace: TraceEvent[] = [
      {
        node: 'roteador',
        kind: 'route',
        content: 'Roteamento automático',
        timestampMs: 1700000000000,
      },
      {
        node: 'react',
        kind: 'action',
        content: { tool: 'list_alerts', args: {} },
        timestampMs: 1700000000100,
      },
      {
        node: 'resposta',
        kind: 'answer',
        content: 'Nenhum alerta ativo.',
        timestampMs: 1700000000200,
      },
    ];

    store.saveRequest(
      {
        id: requestId,
        conversationId: 'conv-full',
        userId: 'user-ops',
        message: 'Alertas ativos?',
        answer: 'Nenhum alerta ativo.',
        route: 'react',
        statusCode: 200,
        status: 'ok',
        latencyMs: 200,
        modelUsed: 'meta-llama/llama-3-8b-instruct:free',
      },
      trace
    );

    const result = store.getRequest(requestId);
    assert.ok(result);
    assert.equal(result.request.id, requestId);
    assert.equal(result.request.answer, 'Nenhum alerta ativo.');
    assert.equal(result.trace.length, 3);
    assert.equal(result.trace[0].seq, 1);
    assert.equal(result.trace[0].node, 'roteador');
    assert.equal(result.trace[1].seq, 2);
    assert.equal(result.trace[1].node, 'react');
    assert.deepEqual(result.trace[1].payload, { tool: 'list_alerts', args: {} });
    assert.equal(result.trace[2].seq, 3);
    assert.equal(result.trace[2].node, 'resposta');
  });

  test('deve retornar null para requisição inexistente em getRequest', () => {
    const store = createInMemoryStore();
    const result = store.getRequest('id-que-nao-existe');
    assert.equal(result, null);
  });
});
