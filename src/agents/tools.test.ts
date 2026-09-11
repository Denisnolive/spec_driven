/**
 * Testes determinísticos das tools do agente sobre SQLite in-memory (:memory:).
 * Sem chamadas de rede, sem LLMs.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteOpsStore } from '../store/sqlite-ops-store.js';
import { createOpsTools, setOpsStore } from './tools.js';
import { InMemoryMemoryStore } from '../memory/memory-store.js';

describe('OpsPilot Tools (SQLite :memory:)', () => {
  let memoryStore: SqliteOpsStore;
  let listAlerts: ReturnType<typeof createOpsTools>['listAlerts'];
  let openIncident: ReturnType<typeof createOpsTools>['openIncident'];
  let resolveIncident: ReturnType<typeof createOpsTools>['resolveIncident'];
  let listIncidents: ReturnType<typeof createOpsTools>['listIncidents'];
  let getOpenIncidentsReport: ReturnType<typeof createOpsTools>['getOpenIncidentsReport'];
  let consultarRunbook: ReturnType<typeof createOpsTools>['consultarRunbook'];

  beforeEach(async () => {
    memoryStore = new SqliteOpsStore(':memory:');
    await memoryStore.seed();
    setOpsStore(memoryStore);

    const toolsBundle = createOpsTools(memoryStore);
    listAlerts = toolsBundle.listAlerts;
    openIncident = toolsBundle.openIncident;
    resolveIncident = toolsBundle.resolveIncident;
    listIncidents = toolsBundle.listIncidents;
    getOpenIncidentsReport = toolsBundle.getOpenIncidentsReport;
    consultarRunbook = toolsBundle.consultarRunbook;
  });

  // ─── list_alerts ────────────────────────────────────────────────────────────

  describe('list_alerts', () => {
    test('retorna todos os 6 alertas do seed quando status=all', async () => {
      const raw = await listAlerts.invoke({ status: 'all' });
      const result = JSON.parse(raw);
      assert.equal(result.length, 6, 'deve retornar 6 alertas');
    });

    test('filtra apenas os 3 alertas firing', async () => {
      const raw = await listAlerts.invoke({ status: 'firing' });
      const result = JSON.parse(raw);
      assert.equal(result.length, 3);
      assert.ok(
        result.every((a: { status: string }) => a.status === 'firing'),
        'todos devem ter status firing'
      );
    });

    test('filtra apenas os 3 alertas resolved', async () => {
      const raw = await listAlerts.invoke({ status: 'resolved' });
      const result = JSON.parse(raw);
      assert.equal(result.length, 3);
      assert.ok(
        result.every((a: { status: string }) => a.status === 'resolved'),
        'todos devem ter status resolved'
      );
    });

    test('retorna alertas firing quando status não é passado (default=firing)', async () => {
      const raw = await listAlerts.invoke({});
      const result = JSON.parse(raw);
      assert.equal(result.length, 3);
      assert.ok(
        result.every((a: { status: string }) => a.status === 'firing'),
        'todos devem ter status firing'
      );
    });
  });

  // ─── open_incident ──────────────────────────────────────────────────────────

  describe('open_incident', () => {
    test('cria incidente e retorna objeto com id gerado e status open', async () => {
      const raw = await openIncident.invoke({
        title: 'Falha crítica no billing',
        service: 'billing-service',
        severity: 'critical',
        summary: 'Transações falhando com timeout na adquirente',
      });
      const result = JSON.parse(raw);

      assert.ok(typeof result.id === 'number' && result.id > 0, 'id deve ser número positivo');
      assert.equal(result.title, 'Falha crítica no billing');
      assert.equal(result.service, 'billing-service');
      assert.equal(result.severity, 'critical');
      assert.equal(result.status, 'open');
      assert.equal(result.summary, 'Transações falhando com timeout na adquirente');
    });

    test('IDs gerados são únicos e crescentes', async () => {
      const r1 = JSON.parse(
        await openIncident.invoke({ title: 'Inc A', service: 'api-gateway', severity: 'low' })
      );
      const r2 = JSON.parse(
        await openIncident.invoke({ title: 'Inc B', service: 'auth-service', severity: 'high' })
      );

      assert.ok(r2.id > r1.id, 'ID do segundo incidente deve ser maior');
    });
  });

  // ─── resolve_incident ───────────────────────────────────────────────────────

  describe('resolve_incident', () => {
    test('atualiza status do incidente para resolved com summary e resolved_at', async () => {
      const created = JSON.parse(
        await openIncident.invoke({ title: 'A resolver', service: 'api-gateway', severity: 'medium' })
      );

      const resolved = JSON.parse(
        await resolveIncident.invoke({ id: created.id, summary: 'Configuração corrigida' })
      );
      assert.equal(resolved.status, 'resolved');
      assert.equal(resolved.id, created.id);
      assert.equal(resolved.summary, 'Configuração corrigida');
      assert.ok(resolved.resolved_at);
    });

    test('retorna erro para ID inexistente', async () => {
      const result = JSON.parse(await resolveIncident.invoke({ id: 999_999 }));
      assert.ok('error' in result, 'deve conter campo error');
      assert.ok(
        (result.error as string).includes('999999'),
        'mensagem de erro deve mencionar o ID'
      );
    });
  });

  // ─── list_incidents ─────────────────────────────────────────────────────────

  describe('list_incidents', () => {
    test('lista incidentes filtrando por open, resolved e all', async () => {
      const inc1 = JSON.parse(
        await openIncident.invoke({ title: 'Inc 1', service: 'checkout', severity: 'high' })
      );
      const inc2 = JSON.parse(
        await openIncident.invoke({ title: 'Inc 2', service: 'payments', severity: 'critical' })
      );

      let openList = JSON.parse(await listIncidents.invoke({ status: 'open' }));
      assert.equal(openList.length, 2);

      await resolveIncident.invoke({ id: inc1.id, summary: 'Resolvido' });

      openList = JSON.parse(await listIncidents.invoke({ status: 'open' }));
      assert.equal(openList.length, 1);
      assert.equal(openList[0].id, inc2.id);

      const resolvedList = JSON.parse(await listIncidents.invoke({ status: 'resolved' }));
      assert.equal(resolvedList.length, 1);
      assert.equal(resolvedList[0].id, inc1.id);

      const allList = JSON.parse(await listIncidents.invoke({ status: 'all' }));
      assert.equal(allList.length, 2);
    });

    test('retorna relatório formatado em blocos quando format=report', async () => {
      await openIncident.invoke({
        title: 'Queda crítica no checkout',
        service: 'checkout',
        severity: 'critical',
      });

      const report = await listIncidents.invoke({ status: 'open', format: 'report' });
      assert.ok(typeof report === 'string');
      assert.ok(report.includes('## Incidentes abertos em produção'));
      assert.ok(report.includes('🔴 **#1 · CRITICAL** — checkout'));
      assert.ok(!report.includes('| --- |'), 'Não deve conter tabelas markdown');
    });
  });

  // ─── get_open_incidents_report ──────────────────────────────────────────────

  describe('get_open_incidents_report', () => {
    test('gera relatório em blocos sem tabelas diretamente', async () => {
      await openIncident.invoke({
        title: 'Alta latência no gateway',
        service: 'api-gateway',
        severity: 'high',
      });

      const report = await getOpenIncidentsReport.invoke({});
      assert.ok(typeof report === 'string');
      assert.ok(report.includes('## Incidentes abertos em produção'));
      assert.ok(report.includes('🟠 **#1 · HIGH** — api-gateway'));
      assert.ok(report.includes('### Ação imediata'));
      assert.ok(!report.includes('| --- |'));
    });
  });

  // ─── consultar_runbook ──────────────────────────────────────────────────────

  describe('consultar_runbook', () => {
    test('retorna conteúdo do runbook para checkout, payments e auth', async () => {
      const checkoutRaw = await consultarRunbook.invoke({ service: 'checkout' });
      const checkout = JSON.parse(checkoutRaw);
      assert.equal(checkout.service, 'checkout');
      assert.ok(checkout.content.includes('gateway de pagamentos'));

      const paymentsRaw = await consultarRunbook.invoke({ service: 'payments' });
      const payments = JSON.parse(paymentsRaw);
      assert.equal(payments.service, 'payments');

      const authRaw = await consultarRunbook.invoke({ service: 'auth' });
      const auth = JSON.parse(authRaw);
      assert.equal(auth.service, 'auth');
    });

    test('retorna mensagem de erro estruturada quando serviço não tem runbook', async () => {
      const raw = await consultarRunbook.invoke({ service: 'servico-inexistente' });
      const result = JSON.parse(raw);
      assert.ok('error' in result);
      assert.ok((result.error as string).includes('servico-inexistente'));
    });
  });

  // ─── check_provider_status ──────────────────────────────────────────────────

  describe('check_provider_status', () => {
    test('retorna status de sucesso para github', async () => {
      const fakeFetch: typeof fetch = async (url) => {
        assert.ok(String(url).includes('githubstatus.com'));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: { indicator: 'none', description: 'All Systems Operational' },
          }),
        } as unknown as Response;
      };

      const toolsBundle = createOpsTools(memoryStore, { fetchFn: fakeFetch });
      const result = await toolsBundle.checkProviderStatus.invoke({ provider: 'github' });
      assert.equal(result, 'github está none - All Systems Operational');
    });

    test('retorna status de sucesso para cloudflare', async () => {
      const fakeFetch: typeof fetch = async (url) => {
        assert.ok(String(url).includes('cloudflarestatus.com'));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: { indicator: 'minor', description: 'Re-routed' },
          }),
        } as unknown as Response;
      };

      const toolsBundle = createOpsTools(memoryStore, { fetchFn: fakeFetch });
      const result = await toolsBundle.checkProviderStatus.invoke({ provider: 'cloudflare' });
      assert.equal(result, 'cloudflare está minor - Re-routed');
    });

    test('usa github por padrão quando parâmetro não é informado', async () => {
      let calledUrl = '';
      const fakeFetch: typeof fetch = async (url) => {
        calledUrl = String(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: { indicator: 'none', description: 'All Systems Operational' },
          }),
        } as unknown as Response;
      };

      const toolsBundle = createOpsTools(memoryStore, { fetchFn: fakeFetch });
      const result = await toolsBundle.checkProviderStatus.invoke({});
      assert.ok(calledUrl.includes('githubstatus.com'));
      assert.equal(result, 'github está none - All Systems Operational');
    });

    test('recupera com sucesso no retry após falha inicial transitória (HTTP 500)', async () => {
      let attempts = 0;
      const fakeFetch: typeof fetch = async () => {
        attempts++;
        if (attempts === 1) {
          return {
            ok: false,
            status: 500,
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: { indicator: 'none', description: 'Operational after retry' },
          }),
        } as unknown as Response;
      };

      const toolsBundle = createOpsTools(memoryStore, { fetchFn: fakeFetch });
      const result = await toolsBundle.checkProviderStatus.invoke({ provider: 'github' });
      assert.equal(attempts, 2, 'deve ter realizado 2 tentativas');
      assert.equal(result, 'github está none - Operational after retry');
    });

    test('informa status page respondendo HTTP não-5xx com erro (ex: 404)', async () => {
      const fakeFetch: typeof fetch = async () => {
        return {
          ok: false,
          status: 404,
        } as unknown as Response;
      };

      const toolsBundle = createOpsTools(memoryStore, { fetchFn: fakeFetch });
      const result = await toolsBundle.checkProviderStatus.invoke({ provider: 'github' });
      assert.equal(result, 'status page de github respondeu HTTP 404');
    });

    test('retorna observação amigável em caso de falha persistente ou timeout sem lançar exceção', async () => {
      const fakeFetch: typeof fetch = async () => {
        throw new Error('Connection timeout');
      };

      const toolsBundle = createOpsTools(memoryStore, { fetchFn: fakeFetch });
      const result = await toolsBundle.checkProviderStatus.invoke({ provider: 'github' });
      assert.ok(result.includes('não consegui consultar o status de github'));
      assert.ok(result.includes('Connection timeout'));
      assert.ok(result.includes('Responda com base nos alertas internos'));
    });

    test('retorna observação de erro quando resposta possui schema inválido sem lançar exceção', async () => {
      const fakeFetch: typeof fetch = async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ invalid_payload: true }),
        } as unknown as Response;
      };

      const toolsBundle = createOpsTools(memoryStore, { fetchFn: fakeFetch });
      const result = await toolsBundle.checkProviderStatus.invoke({ provider: 'github' });
      assert.ok(result.includes('não consegui consultar o status de github'));
      assert.ok(result.includes('Responda com base nos alertas internos'));
    });
  });

  // ─── forget_preference ──────────────────────────────────────────────────────

  describe('forget_preference', () => {
    test('esquece preferência via busca semântica por query', async () => {
      const userMemStore = new InMemoryMemoryStore();
      const testUser = 'user-test-forget';
      await userMemStore.remember(testUser, 'O usuário prefere receber notificações no canal do Slack');
      await userMemStore.remember(testUser, 'O usuário trabalha no turno da madrugada');

      const toolsBundle = createOpsTools(memoryStore, {
        memoryStore: userMemStore,
        userId: testUser,
      });

      const raw = await toolsBundle.forgetPreference.invoke({ query: 'alertas e notificações no slack' });
      const res = JSON.parse(raw);

      assert.equal(res.status, 'success');
      assert.ok(res.message.includes('esquecida com sucesso'));
      assert.ok(res.forgottenFact.includes('notificações no canal do Slack'));

      // Confirma que restou apenas a outra memória
      const remaining = await userMemStore.list(testUser);
      assert.equal(remaining.length, 1);
      assert.ok(remaining[0].fact.includes('madrugada'));
    });

    test('esquece preferência diretamente por memoryId', async () => {
      const userMemStore = new InMemoryMemoryStore();
      const testUser = 'user-test-id';
      const created = await userMemStore.remember(testUser, 'Gosta de relatórios detalhados');

      const toolsBundle = createOpsTools(memoryStore, {
        memoryStore: userMemStore,
        userId: testUser,
      });

      const raw = await toolsBundle.forgetPreference.invoke({
        query: 'qualquer query',
        memoryId: created.memory.id,
      });
      const res = JSON.parse(raw);

      assert.equal(res.status, 'success');
      assert.equal(res.memoryId, created.memory.id);

      const remaining = await userMemStore.list(testUser);
      assert.equal(remaining.length, 0);
    });

    test('retorna not_found quando nenhuma preferência corresponde à query', async () => {
      const userMemStore = new InMemoryMemoryStore();
      const testUser = 'user-empty';

      const toolsBundle = createOpsTools(memoryStore, {
        memoryStore: userMemStore,
        userId: testUser,
      });

      const raw = await toolsBundle.forgetPreference.invoke({ query: 'preferência inexistente de café' });
      const res = JSON.parse(raw);

      assert.equal(res.status, 'not_found');
    });

    test('retorna erro se nenhum usuário ativo for informado', async () => {
      const userMemStore = new InMemoryMemoryStore();
      const toolsBundle = createOpsTools(memoryStore, {
        memoryStore: userMemStore,
        userId: null,
      });

      const raw = await toolsBundle.forgetPreference.invoke({ query: 'minha preferência' });
      const res = JSON.parse(raw);

      assert.ok(res.error.includes('Nenhum usuário ativo identificado'));
    });
  });
});
