import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteOpsStore } from './sqlite-ops-store.js';

describe('SqliteOpsStore (:memory:)', () => {
  let store: SqliteOpsStore;

  beforeEach(async () => {
    store = new SqliteOpsStore(':memory:');
    await store.seed();
  });

  describe('Inicialização e Seed', () => {
    test('popula 5 serviços com tiers válidos', async () => {
      const alerts = await store.listAlerts('all');
      assert.equal(alerts.length, 6);
    });

    test('seed é idempotente e pode ser executado múltiplas vezes', async () => {
      await store.seed();
      await store.seed();

      const alerts = await store.listAlerts('all');
      assert.equal(alerts.length, 6, 'deve manter exatamente 6 alertas após múltiplos seeds');
    });
  });

  describe('Alertas', () => {
    test('filtra alertas por firing, resolved e all', async () => {
      const firing = await store.listAlerts('firing');
      const resolved = await store.listAlerts('resolved');
      const all = await store.listAlerts('all');

      assert.equal(firing.length, 3, 'deve conter 3 alertas firing');
      assert.equal(resolved.length, 3, 'deve conter 3 alertas resolved');
      assert.equal(all.length, 6, 'deve conter 6 alertas no total');

      assert.ok(firing.every((a) => a.status === 'firing'));
      assert.ok(resolved.every((a) => a.status === 'resolved'));
    });
  });

  describe('Incidentes - Ciclo de vida', () => {
    test('abre novo incidente com status open e ID gerado', async () => {
      const inc = await store.openIncident({
        title: 'Queda de conexão no gateway',
        service: 'api-gateway',
        severity: 'critical',
        summary: 'Alta latência e 502 frequentes',
      });

      assert.ok(typeof inc.id === 'number' && inc.id > 0);
      assert.equal(inc.title, 'Queda de conexão no gateway');
      assert.equal(inc.service, 'api-gateway');
      assert.equal(inc.severity, 'critical');
      assert.equal(inc.status, 'open');
      assert.equal(inc.summary, 'Alta latência e 502 frequentes');
      assert.equal(inc.resolved_at, null);
    });

    test('lista incidentes por status open, resolved e all', async () => {
      const inc1 = await store.openIncident({
        title: 'Incidente 1',
        service: 'auth-service',
        severity: 'high',
      });
      const inc2 = await store.openIncident({
        title: 'Incidente 2',
        service: 'billing-service',
        severity: 'medium',
      });

      let openList = await store.listIncidents('open');
      assert.equal(openList.length, 2);

      await store.resolveIncident(inc1.id, 'Chaves JWT rotacionadas com sucesso');

      openList = await store.listIncidents('open');
      assert.equal(openList.length, 1);
      assert.equal(openList[0].id, inc2.id);

      const resolvedList = await store.listIncidents('resolved');
      assert.equal(resolvedList.length, 1);
      assert.equal(resolvedList[0].id, inc1.id);
      assert.equal(resolvedList[0].status, 'resolved');
      assert.equal(resolvedList[0].summary, 'Chaves JWT rotacionadas com sucesso');
      assert.ok(resolvedList[0].resolved_at);

      const allList = await store.listIncidents('all');
      assert.equal(allList.length, 2);
    });

    test('resolve incidente com erro se ID não existir', async () => {
      const result = await store.resolveIncident(99999, 'Solução');
      assert.ok('error' in result);
      assert.ok((result.error as string).includes('99999'));
    });
  });

  describe('Runbooks', () => {
    test('recupera runbook por serviço com case-insensitivity', async () => {
      const runbookCheckout = await store.getRunbook('checkout');
      assert.ok(runbookCheckout);
      assert.equal(runbookCheckout.service, 'checkout');
      assert.ok(runbookCheckout.content.includes('gateway de pagamentos'));

      const runbookAuthUpper = await store.getRunbook('AUTH');
      assert.ok(runbookAuthUpper);
      assert.equal(runbookAuthUpper.service, 'auth');
    });

    test('retorna null para serviço sem runbook', async () => {
      const result = await store.getRunbook('servico-desconhecido');
      assert.equal(result, null);
    });
  });

  describe('Constraints CHECK do SQLite', () => {
    test('impede inserção de severidade inválida em incidents', async () => {
      await assert.rejects(async () => {
        await store.openIncident({
          title: 'Teste Inválido',
          service: 'api-gateway',
          severity: 'severidade-inexistente' as unknown as 'low',
        });
      }, /CHECK constraint failed/i);
    });
  });
});
