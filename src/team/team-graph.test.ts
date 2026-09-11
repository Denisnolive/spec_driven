import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  supervisorNode,
  analystNode,
  plannerNode,
  executorNode,
  createTeamGraph,
  runTeamGraph,
  analystReadTools,
  executorIncidentTools,
} from './index.js';
import { TeamState, type TeamGraphState, nextSchema } from './types.js';

describe('Team Mode (Modo Equipe Supervisionada)', () => {
  describe('US1: Supervisor com withStructuredOutput e Blackboard', () => {
    it('deve emitir decisão estruturada { next, brief } e registrar evento de handoff', async () => {
      const mockModel = {
        withStructuredOutput(schema: any) {
          return {
            async invoke(input: any) {
              return {
                next: 'analista' as const,
                brief: 'Verifique os alertas e runbooks de checkout',
              };
            },
          };
        },
      };

      const initialState: TeamGraphState = {
        task: 'O checkout está falhando',
        history: [],
        builtContext: undefined,
        blackboard: {
          task: 'O checkout está falhando',
          findings: [],
          actions: [],
          status: 'triaging',
        },
        next: 'supervisor',
        brief: '',
        iterationCount: 0,
        trace: [],
        answer: '',
        metrics: { llmCalls: 0, latencyMs: 0 },
      };

      const update = await supervisorNode(initialState, { model: mockModel as any });

      assert.equal(update.next, 'analista');
      assert.equal(update.brief, 'Verifique os alertas e runbooks de checkout');
      assert.equal(update.iterationCount, 1);
      assert.equal(update.trace?.length, 1);

      const handoff = update.trace?.[0];
      assert.equal(handoff?.kind, 'handoff');
      assert.equal(handoff?.type, 'handoff');
      assert.equal(handoff?.from, 'supervisor');
      assert.equal(handoff?.to, 'analista');
      assert.equal(handoff?.brief, 'Verifique os alertas e runbooks de checkout');
      assert.equal(handoff?.iteration, 1);
    });
  });

  describe('US2: Especialização Rígida de Papéis', () => {
    it('Analista deve possuir apenas ferramentas de leitura e não de mutação', () => {
      const toolNames: string[] = analystReadTools.map((t) => t.name);
      assert.ok(toolNames.includes('list_alerts'));
      assert.ok(toolNames.includes('consultar_runbook'));
      assert.ok(toolNames.includes('list_incidents'));
      assert.ok(toolNames.includes('get_open_incidents_report'));
      assert.ok(toolNames.includes('check_provider_status'));

      // Não pode conter ferramentas de mutação
      assert.ok(!toolNames.includes('open_incident'), 'Analista NÃO pode ter open_incident');
      assert.ok(!toolNames.includes('resolve_incident'), 'Analista NÃO pode ter resolve_incident');
    });

    it('Analista deve registrar dados factuais no blackboard.findings sem propor plano', async () => {
      const mockAnalystModel = {
        bindTools() {
          return {
            async invoke() {
              return {
                content: 'Fato: 3 alertas firing no gateway e 0 incidentes abertos.',
                tool_calls: [],
              };
            },
          };
        },
      };

      const state: TeamGraphState = {
        task: 'Verificar gateway',
        history: [],
        builtContext: undefined,
        blackboard: {
          task: 'Verificar gateway',
          findings: [],
          actions: [],
          status: 'triaging',
        },
        next: 'analista',
        brief: 'Colete métricas factuais do gateway',
        iterationCount: 1,
        trace: [],
        answer: '',
        metrics: { llmCalls: 0, latencyMs: 0 },
      };

      const update = await analystNode(state, { model: mockAnalystModel as any });

      assert.equal(update.blackboard?.status, 'triaging');
      assert.ok(update.blackboard?.findings && update.blackboard.findings.length > 0);
      assert.ok(update.blackboard.findings[0].includes('Fato: 3 alertas firing'));
      assert.equal(update.blackboard?.plan, undefined, 'Analista não pode preencher plan');
    });

    it('Planejador deve operar sem ferramentas externas (zero tools) e preencher blackboard.plan', async () => {
      let bindToolsCalled = false;
      const mockPlannerModel = {
        bindTools() {
          bindToolsCalled = true;
          return this;
        },
        async invoke() {
          return {
            content: '1. Investigar pod de auth\n2. Abrir incidente severity high se latência > 2s\n3. Executar runbook de restart',
          };
        },
      };

      const state: TeamGraphState = {
        task: 'Degradação em auth',
        history: [],
        builtContext: undefined,
        blackboard: {
          task: 'Degradação em auth',
          findings: ['Alta latência de 2.5s observada em auth'],
          actions: [],
          status: 'triaging',
        },
        next: 'planejador',
        brief: 'Trace o plano de mitigação',
        iterationCount: 2,
        trace: [],
        answer: '',
        metrics: { llmCalls: 0, latencyMs: 0 },
      };

      const update = await plannerNode(state, { model: mockPlannerModel as any });

      assert.equal(bindToolsCalled, false, 'Planejador NUNCA deve chamar bindTools');
      assert.equal(update.blackboard?.status, 'planning');
      assert.ok(update.blackboard?.plan?.includes('1. Investigar pod de auth'));
    });

    it('Executor deve possuir apenas ferramentas de incidentes sem bypass', () => {
      const toolNames: string[] = executorIncidentTools.map((t) => t.name);
      assert.ok(toolNames.includes('open_incident'));
      assert.ok(toolNames.includes('resolve_incident'));
      assert.ok(toolNames.includes('list_incidents'));

      assert.ok(!toolNames.includes('consultar_runbook'), 'Executor foca em incidentes');
      assert.ok(!toolNames.includes('list_alerts'), 'Executor foca em incidentes');
    });

    it('Executor deve registrar intervenções em blackboard.actions', async () => {
      const mockExecutorModel = {
        bindTools() {
          return {
            async invoke() {
              return {
                content: 'Incidente #102 aberto com severidade high.',
                tool_calls: [],
              };
            },
          };
        },
      };

      const state: TeamGraphState = {
        task: 'Abrir incidente do gateway',
        history: [],
        builtContext: undefined,
        blackboard: {
          task: 'Abrir incidente do gateway',
          findings: ['Gateway 503'],
          plan: 'Abrir incidente high para gateway',
          actions: [],
          status: 'planning',
        },
        next: 'executor',
        brief: 'Abra o incidente',
        iterationCount: 3,
        trace: [],
        answer: '',
        metrics: { llmCalls: 0, latencyMs: 0 },
      };

      const update = await executorNode(state, { model: mockExecutorModel as any });

      assert.equal(update.blackboard?.status, 'executing');
      assert.ok(update.blackboard?.actions && update.blackboard.actions.length > 0);
      assert.ok(update.blackboard.actions[0].includes('Incidente #102'));
    });
  });

  describe('US5: Teto de Segurança de 8 Iterações', () => {
    it('deve forçar next: "done" e status "exhausted" ao ultrapassar o teto de 8 turnos', async () => {
      const mockModel = {
        withStructuredOutput() {
          return {
            async invoke() {
              return {
                next: 'analista' as const,
                brief: 'Tente mais uma vez',
              };
            },
          };
        },
      };

      const stateAtMax: TeamGraphState = {
        task: 'Loop infinito',
        history: [],
        builtContext: undefined,
        blackboard: {
          task: 'Loop infinito',
          findings: ['Loop'],
          actions: [],
          status: 'triaging',
        },
        next: 'supervisor',
        brief: '',
        iterationCount: 8, // Já executou 8 turnos
        trace: [],
        answer: '',
        metrics: { llmCalls: 8, latencyMs: 0 },
      };

      const update = await supervisorNode(stateAtMax, { model: mockModel as any });

      assert.equal(update.next, 'done', 'Deve forçar done no teto');
      assert.equal(update.blackboard?.status, 'exhausted');
      assert.ok(update.brief?.includes('Teto operacional da equipe atingido (8/8 turnos)'));

      const handoff = update.trace?.[0];
      assert.equal(handoff?.to, 'done');
      assert.equal(handoff?.iteration, 8);
    });
  });

  describe('Ciclo Completo do Grafo da Equipe (createTeamGraph)', () => {
    it('deve orquestrar supervisor -> analista -> supervisor -> done com sucesso', async () => {
      let supervisorCalls = 0;

      const mockSupervisorModel = {
        withStructuredOutput() {
          return {
            async invoke() {
              supervisorCalls++;
              if (supervisorCalls === 1) {
                return {
                  next: 'analista' as const,
                  brief: 'Inspecione o serviço checkout',
                };
              }
              return {
                next: 'done' as const,
                brief: 'Atendimento concluído com base nos alertas observados.',
              };
            },
          };
        },
      };

      const mockAnalystModel = {
        bindTools() {
          return {
            async invoke() {
              return {
                content: 'Alerta firing: latência acima de 500ms em checkout.',
                tool_calls: [],
              };
            },
          };
        },
      };

      const graph = createTeamGraph({
        supervisorModel: mockSupervisorModel,
        analystModel: mockAnalystModel,
      });

      const result = await graph.invoke({
        task: 'Investigue o checkout',
        history: [],
        blackboard: {
          task: 'Investigue o checkout',
          findings: [],
          actions: [],
          status: 'triaging',
        },
        iterationCount: 0,
      });

      assert.equal(supervisorCalls, 2);
      assert.equal(result.blackboard.status, 'completed');
      assert.ok(result.blackboard.findings.length > 0);
      assert.ok(result.answer.includes('Atendimento concluído'));

      // Checa se os eventos handoff foram registrados
      const handoffs = result.trace.filter((e: any) => e.kind === 'handoff' || e.type === 'handoff');
      assert.ok(handoffs.length >= 2, 'Deve conter ao menos 2 eventos handoff');
      assert.equal(handoffs[0].to, 'analista');
      assert.equal(handoffs[1].to, 'done');
    });
  });
});
