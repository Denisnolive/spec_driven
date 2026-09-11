/**
 * Testes de formatação e tipagem de TraceEvent e Metrics.
 * 100% determinísticos — sem rede, sem banco.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { TraceEvent, Metrics, ActionPayload, TraceEventKind } from './types.js';

// ─── TraceEvent — kind 'action' ───────────────────────────────────────────────

describe('TraceEvent — action', () => {
  test('content é ActionPayload com tool e args', () => {
    const event: TraceEvent = {
      kind: 'action',
      content: { tool: 'list_alerts', args: { status: 'firing' } },
      timestampMs: 1_000,
    };

    assert.equal(event.kind, 'action');
    assert.ok(typeof event.content === 'object', 'content deve ser objeto');

    const payload = event.content as ActionPayload;
    assert.equal(payload.tool, 'list_alerts');
    assert.deepEqual(payload.args, { status: 'firing' });
  });

  test('args pode conter valores aninhados', () => {
    const event: TraceEvent = {
      kind: 'action',
      content: {
        tool: 'open_incident',
        args: { title: 'CPU alta', service: 'api-gateway', severity: 'high' },
      },
      timestampMs: 2_000,
    };

    const p = event.content as ActionPayload;
    assert.equal(p.args['severity'], 'high');
  });
});

// ─── TraceEvent — kinds com conteúdo string ───────────────────────────────────

describe('TraceEvent — string content kinds', () => {
  const stringKinds: TraceEventKind[] = [
    'thought', 'observation', 'plan', 'critique', 'answer', 'route', 'fallback',
  ];

  for (const kind of stringKinds) {
    test(`kind '${kind}' tem content string`, () => {
      const event: TraceEvent = {
        kind,
        content: `Conteúdo de ${kind}`,
        timestampMs: 3_000,
        node: 'roteador',
      };

      assert.equal(typeof event.content, 'string');
      assert.ok((event.content as string).includes(kind));
      assert.equal(event.node, 'roteador');
    });
  }

  test('kind route aceita campos route, reason e type', () => {
    const event: TraceEvent = {
      kind: 'route',
      type: 'route',
      route: 'react',
      reason: 'Consulta direta',
      content: 'Roteado para react: Consulta direta',
      timestampMs: 3_500,
      node: 'roteador',
    };

    assert.equal(event.kind, 'route');
    assert.equal(event.type, 'route');
    assert.equal(event.route, 'react');
    assert.equal(event.reason, 'Consulta direta');
    assert.equal(event.node, 'roteador');
  });

  test('kind fallback aceita campos fromModel, toModel e error', () => {
    const event: TraceEvent = {
      kind: 'fallback',
      type: 'fallback',
      node: 'react',
      content: 'Falha no primário, acionando fallback',
      fromModel: 'openrouter/free',
      toModel: 'meta-llama/llama-3-8b-instruct:free',
      error: '429 Rate limit exceeded',
      timestampMs: 3_600,
    };

    assert.equal(event.kind, 'fallback');
    assert.equal(event.node, 'react');
    assert.equal(event.fromModel, 'openrouter/free');
    assert.equal(event.toModel, 'meta-llama/llama-3-8b-instruct:free');
    assert.equal(event.error, '429 Rate limit exceeded');
  });
});


// ─── TraceEvent — timestampMs ─────────────────────────────────────────────────

describe('TraceEvent — timestampMs', () => {
  test('timestampMs deve ser número positivo', () => {
    const now = Date.now();
    const event: TraceEvent = {
      kind: 'thought',
      content: 'Análise em andamento',
      timestampMs: now,
    };

    assert.ok(event.timestampMs > 0);
    assert.ok(event.timestampMs <= Date.now());
  });

  test('eventos em sequência têm timestamps crescentes ou iguais', () => {
    const events: TraceEvent[] = [
      { kind: 'plan',        content: 'Plano inicial',   timestampMs: 1_000 },
      { kind: 'action',      content: { tool: 't', args: {} }, timestampMs: 1_500 },
      { kind: 'observation', content: 'Resultado da tool', timestampMs: 2_000 },
      { kind: 'answer',      content: 'Resposta final',  timestampMs: 2_500 },
    ];

    for (let i = 1; i < events.length; i++) {
      assert.ok(
        events[i].timestampMs >= events[i - 1].timestampMs,
        `Evento ${i} deve ter timestamp >= anterior`
      );
    }
  });
});

// ─── Metrics ──────────────────────────────────────────────────────────────────

describe('Metrics', () => {
  test('campos são numéricos e não-negativos', () => {
    const m: Metrics = { llmCalls: 4, latencyMs: 2_350 };

    assert.equal(typeof m.llmCalls, 'number');
    assert.equal(typeof m.latencyMs, 'number');
    assert.ok(m.llmCalls >= 0);
    assert.ok(m.latencyMs >= 0);
  });

  test('llmCalls e latencyMs aceitam zero', () => {
    const m: Metrics = { llmCalls: 0, latencyMs: 0 };
    assert.equal(m.llmCalls, 0);
    assert.equal(m.latencyMs, 0);
  });

  test('valores corretos são preservados', () => {
    const m: Metrics = { llmCalls: 7, latencyMs: 12_450, modelUsed: 'openrouter/free' };
    assert.equal(m.llmCalls, 7);
    assert.equal(m.latencyMs, 12_450);
    assert.equal(m.modelUsed, 'openrouter/free');
  });
});

// ─── Trace completo (integração de tipos) ─────────────────────────────────────

describe('Trace completo', () => {
  test('trace de operação típica tem kinds corretos em ordem', () => {
    const trace: TraceEvent[] = [
      { kind: 'plan',        content: '1. Listar alertas\n2. Abrir incidente', timestampMs: 100 },
      { kind: 'action',      content: { tool: 'list_alerts', args: { status: 'firing' } }, timestampMs: 200 },
      { kind: 'observation', content: '[{"id":1,"status":"firing"}]', timestampMs: 300 },
      { kind: 'critique',    content: 'Plano revisado: apenas 1 passo restante', timestampMs: 400 },
      { kind: 'action',      content: { tool: 'open_incident', args: { title: 'CPU alta', service: 'api-gateway', severity: 'high' } }, timestampMs: 500 },
      { kind: 'observation', content: '{"id":1,"status":"open"}', timestampMs: 600 },
      { kind: 'answer',      content: 'Incidente #1 aberto com sucesso.', timestampMs: 700 },
    ];

    // Verifica kinds em sequência
    const kinds = trace.map((e) => e.kind);
    assert.ok(kinds.includes('plan'));
    assert.ok(kinds.includes('action'));
    assert.ok(kinds.includes('observation'));
    assert.ok(kinds.includes('answer'));
    assert.equal(kinds[kinds.length - 1], 'answer', 'último evento deve ser answer');

    // Verifica que events de action têm ActionPayload
    const actions = trace.filter((e) => e.kind === 'action');
    for (const a of actions) {
      assert.ok(typeof a.content === 'object');
      assert.ok('tool' in (a.content as object));
      assert.ok('args' in (a.content as object));
    }
  });
});
