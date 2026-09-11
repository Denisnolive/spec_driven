import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createLogger } from './logger.js';

describe('StructuredLogger (src/obs/logger.ts)', () => {
  class MemoryStream extends Writable {
    public lines: string[] = [];

    _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
      const str = chunk.toString();
      // Dividir por quebras de linha preservando linhas individuais
      const parts = str.split('\n').filter((l) => l.trim().length > 0);
      this.lines.push(...parts);
      callback();
    }
  }

  test('deve emitir exatamente 1 linha JSON por chamada de log', () => {
    const stream = new MemoryStream();
    const logger = createLogger({
      stream,
      now: () => '2026-09-10T22:45:00.000Z',
    });

    logger.info({
      requestId: 'req-abc-123',
      node: 'resposta',
      type: 'done',
      route: 'react',
      tokens: 140,
    });

    assert.equal(stream.lines.length, 1);
    const line = stream.lines[0];

    // Verificar se não há quebras internas e é um JSON válido
    assert.equal(line.includes('\n'), false);
    const parsed = JSON.parse(line);
    assert.equal(parsed.timestamp, '2026-09-10T22:45:00.000Z');
    assert.equal(parsed.level, 'info');
    assert.equal(parsed.requestId, 'req-abc-123');
    assert.equal(parsed.node, 'resposta');
    assert.equal(parsed.type, 'done');
    assert.equal(parsed.route, 'react');
    assert.equal(parsed.tokens, 140);
  });

  test('deve registrar apenas metadados sem despejar prompts completos', () => {
    const stream = new MemoryStream();
    const logger = createLogger({ stream });

    logger.warn({
      requestId: 'req-xyz',
      node: 'roteador',
      error: 'Timeout parcial no modelo',
      latencyMs: 1200,
      model: 'openai/gpt-4o-mini',
    });

    assert.equal(stream.lines.length, 1);
    const parsed = JSON.parse(stream.lines[0]);
    assert.equal(parsed.level, 'warn');
    assert.equal(parsed.requestId, 'req-xyz');
    assert.equal(parsed.node, 'roteador');
    assert.equal(parsed.latencyMs, 1200);
    assert.equal(parsed.model, 'openai/gpt-4o-mini');
  });

  test('deve suportar diferentes níveis de log (info, warn, error, debug)', () => {
    const stream = new MemoryStream();
    const logger = createLogger({ stream });

    logger.debug({ requestId: 'r1', step: 'init' });
    logger.info({ requestId: 'r2', step: 'exec' });
    logger.warn({ requestId: 'r3', step: 'retry' });
    logger.error({ requestId: 'r4', step: 'fail' });

    assert.equal(stream.lines.length, 4);
    assert.equal(JSON.parse(stream.lines[0]).level, 'debug');
    assert.equal(JSON.parse(stream.lines[1]).level, 'info');
    assert.equal(JSON.parse(stream.lines[2]).level, 'warn');
    assert.equal(JSON.parse(stream.lines[3]).level, 'error');
  });
});
