import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOpenIncidentsReport,
  sortIncidents,
  computeReportSummary,
  detectDuplicates,
  type IncidentItem,
} from './incident-reporter.js';

const mockIncidents: IncidentItem[] = [
  {
    id: 1,
    title: 'Alta latência no checkout - p99 acima de 2 segundos',
    service: 'checkout',
    severity: 'medium',
    status: 'open',
    resolved_at: null,
    summary: 'O percentil p99 de latência do serviço checkout ultrapassou 2 segundos.',
    created_at: '2026-09-04 17:57:43',
  },
  {
    id: 2,
    title: 'P99 latency do checkout acima de 2 segundos',
    service: 'checkout',
    severity: 'medium',
    status: 'open',
    resolved_at: null,
    summary: 'O p99 de latência do serviço de checkout ultrapassou o limiar de 2 segundos.',
    created_at: '2026-09-04 19:26:39',
  },
  {
    id: 3,
    title: 'Teste de notificação - incidente de baixa severidade',
    service: 'notification-service',
    severity: 'low',
    status: 'open',
    resolved_at: null,
    summary: 'Incidente de teste criado para validar o sistema.',
    created_at: '2026-09-08 11:08:21',
  },
  {
    id: 4,
    title: 'Teste de notificações - notification-service',
    service: 'notification-service',
    severity: 'medium',
    status: 'open',
    resolved_at: null,
    summary: 'Incidente de teste criado para validar notificações.',
    created_at: '2026-09-08 11:21:52',
  },
  {
    id: 5,
    title: 'Teste de notificacoes via MCP - notification-service',
    service: 'notification-service',
    severity: 'medium',
    status: 'open',
    resolved_at: null,
    summary: 'Incidente de teste criado VIA MCP.',
    created_at: '2026-09-08 11:30:43',
  },
  {
    id: 6,
    title: 'Incidente de baixa severidade no auth',
    service: 'auth',
    severity: 'low',
    status: 'open',
    resolved_at: null,
    summary: null,
    created_at: '2026-09-08 23:09:20',
  },
  {
    id: 7,
    title: 'Problema no serviço auth',
    service: 'auth',
    severity: 'low',
    status: 'open',
    resolved_at: null,
    summary: null,
    created_at: '2026-09-08 23:14:10',
  },
  {
    id: 8,
    title: 'Low severity incident in auth service',
    service: 'auth',
    severity: 'low',
    status: 'open',
    resolved_at: null,
    summary: null,
    created_at: '2026-09-08 23:14:22',
  },
  {
    id: 9,
    title: 'Fila de e-mails atrasada no notification-service',
    service: 'notification-service',
    severity: 'low',
    status: 'open',
    resolved_at: null,
    summary: 'A fila de e-mails está apresentando atraso no processamento.',
    created_at: '2026-09-09 10:44:44',
  },
  {
    id: 10,
    title: 'Busca lenta no p95 no api-gateway',
    service: 'api-gateway',
    severity: 'high',
    status: 'open',
    resolved_at: null,
    summary: 'Degradação identificada na latência de busca no api-gateway, com p95 acima do esperado.',
    created_at: '2026-09-09 10:44:52',
  },
  {
    id: 11,
    title: 'P99 acima de 2s e carrinho falhando no checkout',
    service: 'checkout',
    severity: 'critical',
    status: 'open',
    resolved_at: null,
    summary: 'O checkout está apresentando alta latência (p99 acima de 2s) e problemas com o carrinho.',
    created_at: '2026-09-09 10:45:08',
  },
  {
    id: 12,
    title: 'Revisão necessária no runbook operacional',
    service: 'runbook',
    severity: 'medium',
    status: 'open',
    resolved_at: null,
    summary: 'Abrir e acompanhar a necessidade de revisão do runbook.',
    created_at: '2026-09-11 11:49:43',
  },
];

test('formatOpenIncidentsReport: não utiliza tabelas markdown', () => {
  const result = formatOpenIncidentsReport(mockIncidents);
  assert.ok(!result.markdown.includes('| --- |'), 'Não deve conter linhas divisórias de tabelas markdown');
  assert.ok(!result.markdown.includes('|:---|'), 'Não deve conter alinhadores de tabelas');
});

test('formatOpenIncidentsReport: cabeçalho quantitativo consistente', () => {
  const result = formatOpenIncidentsReport(mockIncidents);
  assert.equal(result.summary.total, 12);
  assert.equal(result.summary.critical, 1);
  assert.equal(result.summary.high, 1);
  assert.equal(result.summary.medium, 5);
  assert.equal(result.summary.low, 5);
  assert.ok(result.markdown.includes('## Incidentes abertos em produção'));
  assert.ok(result.markdown.includes('Total: 12 | Critical: 1 | High: 1 | Medium: 5 | Low: 5'));
});

test('formatOpenIncidentsReport: ordenação por severidade e data decrescente', () => {
  const result = formatOpenIncidentsReport(mockIncidents);
  const ids = result.sortedIncidents.map((inc) => inc.id);

  // Primeiro deve ser o Critical (ID 11)
  assert.equal(ids[0], 11);
  // Segundo deve ser o High (ID 10)
  assert.equal(ids[1], 10);
  // Terceiro deve ser o Medium mais recente (ID 12 de 2026-09-11)
  assert.equal(ids[2], 12);

  // Verifica que os blocos de texto contêm os emojis corretos
  assert.ok(result.markdown.includes('🔴 **#11 · CRITICAL** — checkout'));
  assert.ok(result.markdown.includes('🟠 **#10 · HIGH** — api-gateway'));
  assert.ok(result.markdown.includes('🟡 **#12 · MEDIUM** — runbook'));
  assert.ok(result.markdown.includes('⚪ **#9 · LOW** — notification-service'));
});

test('formatOpenIncidentsReport: detecção de suspeitas de duplicidade', () => {
  const result = formatOpenIncidentsReport(mockIncidents);
  assert.ok(result.duplicates.length > 0, 'Deve identificar duplicidades');

  // #1 e #2 no checkout
  assert.ok(
    result.duplicates.some((d) => (d.idA === 1 && d.idB === 2) && d.service === 'checkout'),
    'Deve detectar duplicidade entre #1 e #2 no checkout'
  );

  // #4 e #5 no notification-service
  assert.ok(
    result.duplicates.some((d) => (d.idA === 4 && d.idB === 5) && d.service === 'notification-service'),
    'Deve detectar duplicidade entre #4 e #5 no notification-service'
  );

  assert.ok(result.markdown.includes('⚠️ Possível duplicidade: #1 e #2 (checkout) — sintomas semelhantes.'));
});

test('formatOpenIncidentsReport: seção de ação imediata para Critical e High', () => {
  const result = formatOpenIncidentsReport(mockIncidents);
  assert.equal(result.immediateActions.length, 2);
  assert.equal(result.immediateActions[0].id, 11);
  assert.equal(result.immediateActions[1].id, 10);

  assert.ok(result.markdown.includes('### Ação imediata'));
  assert.ok(result.markdown.includes('- #11 (checkout) —'));
  assert.ok(result.markdown.includes('- #10 (api-gateway) —'));
});

test('formatOpenIncidentsReport: caso de borda sem incidentes', () => {
  const result = formatOpenIncidentsReport([]);
  assert.equal(result.summary.total, 0);
  assert.equal(result.summary.critical, 0);
  assert.equal(result.summary.high, 0);
  assert.ok(result.markdown.includes('Total: 0 | Critical: 0 | High: 0 | Medium: 0 | Low: 0'));
  assert.ok(result.markdown.includes('Nenhum incidente aberto no momento.'));
  assert.ok(!result.markdown.includes('### Ação imediata'));
});

test('formatOpenIncidentsReport: caso de borda sem incidentes críticos ou altos', () => {
  const onlyLowMed = mockIncidents.filter((inc) => inc.severity === 'low' || inc.severity === 'medium');
  const result = formatOpenIncidentsReport(onlyLowMed);
  assert.equal(result.summary.critical, 0);
  assert.equal(result.summary.high, 0);
  assert.equal(result.immediateActions.length, 0);
  assert.ok(!result.markdown.includes('### Ação imediata'));
});
