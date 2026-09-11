import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProductionGraph,
  runProductionGraph,
  routeSchema,
  SYSTEM_PROMPT,
  type StructuredRouterModel,
  type RouteVerdict,
} from './production-graph.js';
import type { ReasoningStrategy, StrategyResult, TraceEvent } from '../agents/types.js';
import { ContextBuilder } from '../context/context-builder.js';

// ─── Helpers de Mock para Testes Determinísticos ─────────────────────────────

function createMockRouterModel(verdict: RouteVerdict): StructuredRouterModel {
  return {
    withStructuredOutput(_schema: typeof routeSchema) {
      return {
        async invoke(_input: unknown): Promise<RouteVerdict> {
          return verdict;
        },
      };
    },
  };
}

function createMockStrategy(name: string, answerText: string, traceEvents: TraceEvent[] = []): ReasoningStrategy {
  return {
    name,
    async run(_input): Promise<StrategyResult> {
      return {
        answer: answerText,
        trace: traceEvents.length > 0
          ? traceEvents
          : [
              { kind: 'thought', content: `Executando ${name}`, timestampMs: Date.now() },
              { kind: 'answer', content: answerText, timestampMs: Date.now() },
            ],
        metrics: {
          llmCalls: 1,
          latencyMs: 10,
        },
      };
    },
  };
}

// ─── Suíte de Testes do Grafo Unificado ──────────────────────────────────────

describe('Grafo Unificado de Produção (Production Graph)', () => {
  describe('Nó Roteador e Saída Estruturada', () => {
    test('roteia para "react" e emite evento route com node: "roteador"', async () => {
      const mockModel = createMockRouterModel({
        route: 'react',
        reason: 'Pergunta direta de status',
      });

      const mockReact = createMockStrategy('react', 'Serviço operacional');
      const graph = createProductionGraph({
        model: mockModel,
        reactStrategy: mockReact,
      });

      const result = await graph.invoke({
        input: 'Como está o auth?',
        message: 'Como está o auth?',
      });

      assert.equal(result.route, 'react');
      assert.equal(result.isOverride, false);

      const routeEvent = result.trace.find((e: TraceEvent) => e.kind === 'route');
      assert.ok(routeEvent, 'Deve emitir evento de trace com kind "route"');
      assert.equal(routeEvent?.node, 'roteador');
      assert.equal(routeEvent?.route, 'react');
      assert.equal(routeEvent?.reason, 'Pergunta direta de status');
    });

    test('roteia para "planExecute" quando a intenção demanda múltiplos passos', async () => {
      const mockModel = createMockRouterModel({
        route: 'planExecute',
        reason: 'Tarefa encadeada de triagem e abertura de incidente',
      });

      const mockPlan = createMockStrategy('planExecute', 'Plano concluído');
      const graph = createProductionGraph({
        model: mockModel,
        planExecuteStrategy: mockPlan,
      });

      const result = await graph.invoke({
        input: 'Verifique o gateway, consulte runbook e abra incidente',
      });

      assert.equal(result.route, 'planExecute');
      assert.equal(result.answer, 'Plano concluído');

      const routeEvent = result.trace.find((e: TraceEvent) => e.kind === 'route');
      assert.ok(routeEvent);
      assert.equal(routeEvent?.node, 'roteador');
      assert.equal(routeEvent?.route, 'planExecute');
    });

    test('roteia para "reflect" quando a intenção demanda auditoria crítica', async () => {
      const mockModel = createMockRouterModel({
        route: 'reflect',
        reason: 'Auditoria crítica de RCA',
      });

      const mockReflect = createMockStrategy('reflect', 'Análise crítica aprovada');
      const graph = createProductionGraph({
        model: mockModel,
        reflectStrategy: mockReflect,
      });

      const result = await graph.invoke({
        input: 'Audite a causa raiz com base nas evidências',
      });

      assert.equal(result.route, 'reflect');
      assert.equal(result.answer, 'Análise crítica aprovada');

      const routeEvent = result.trace.find((e: TraceEvent) => e.kind === 'route');
      assert.ok(routeEvent);
      assert.equal(routeEvent?.node, 'roteador');
      assert.equal(routeEvent?.route, 'reflect');
    });

    test('fallback seguro para "react" caso o modelo estruturado lance erro', async () => {
      const failingModel: StructuredRouterModel = {
        withStructuredOutput() {
          return {
            async invoke() {
              throw new Error('LLM Timeout');
            },
          };
        },
      };

      const mockReact = createMockStrategy('react', 'Resposta fallback');
      const graph = createProductionGraph({
        model: failingModel,
        reactStrategy: mockReact,
      });

      const result = await graph.invoke({ input: 'Qualquer pergunta' });

      assert.equal(result.route, 'react');
      const routeEvent = result.trace.find((e: TraceEvent) => e.kind === 'route');
      assert.ok(routeEvent);
      assert.equal(routeEvent?.node, 'roteador');
      assert.equal(routeEvent?.route, 'react');
    });
  });

  describe('Override Manual de Estratégia', () => {
    test('respeita override manual "planExecute" sem chamar LLM do roteador', async () => {
      let routerLlmCalled = false;
      const spyModel: StructuredRouterModel = {
        withStructuredOutput() {
          return {
            async invoke() {
              routerLlmCalled = true;
              return { route: 'react', reason: 'ignorado' };
            },
          };
        },
      };

      const mockPlan = createMockStrategy('planExecute', 'Executado via override');
      const graph = createProductionGraph({
        model: spyModel,
        planExecuteStrategy: mockPlan,
      });

      const result = await graph.invoke({
        input: 'Qualquer entrada',
        strategy: 'planExecute',
      });

      assert.equal(routerLlmCalled, false, 'Não deve chamar LLM do roteador se houver override');
      assert.equal(result.route, 'planExecute');
      assert.equal(result.isOverride, true);

      const routeEvent = result.trace.find((e: TraceEvent) => e.kind === 'route');
      assert.ok(routeEvent);
      assert.equal(routeEvent?.node, 'roteador');
      assert.ok(routeEvent?.reason?.includes('Override manual'));
      assert.ok(typeof routeEvent?.content === 'string' && routeEvent.content.includes('override manual'));
    });

    test('normaliza aliases de override como "plan-and-execute" e "reflection"', async () => {
      const mockPlan = createMockStrategy('planExecute', 'Resposta plan');
      const mockReflect = createMockStrategy('reflect', 'Resposta reflect');

      const graph = createProductionGraph({
        planExecuteStrategy: mockPlan,
        reflectStrategy: mockReflect,
      });

      const res1 = await graph.invoke({ input: 'x', strategy: 'plan-and-execute' });
      assert.equal(res1.route, 'planExecute');

      const res2 = await graph.invoke({ input: 'x', strategy: 'reflection' });
      assert.equal(res2.route, 'reflect');
    });
  });

  describe('Campo node em Todo o Trace', () => {
    test('garante que 100% dos eventos no trace possuem a propriedade node preenchida', async () => {
      const mockModel = createMockRouterModel({
        route: 'react',
        reason: 'Teste de traces',
      });

      const mockReact: ReasoningStrategy = {
        name: 'react',
        async run() {
          return {
            answer: 'Resposta pronta',
            trace: [
              { kind: 'thought', content: 'Pensando...', timestampMs: 1 },
              { kind: 'action', content: { tool: 'list_alerts', args: {} }, timestampMs: 2 },
              { kind: 'observation', content: '[]', timestampMs: 3 },
            ],
            metrics: { llmCalls: 2, latencyMs: 50 },
          };
        },
      };

      const graph = createProductionGraph({
        model: mockModel,
        reactStrategy: mockReact,
      });

      const result = await graph.invoke({ input: 'Verifique alertas' });

      assert.ok(result.trace.length >= 4, 'Trace deve conter roteamento, passos da estratégia e resposta');

      for (const event of result.trace) {
        assert.ok(
          event.node !== undefined && event.node.trim().length > 0,
          `Evento do kind "${event.kind}" deve possuir propriedade node definida. Encontrado: ${JSON.stringify(event)}`
        );
      }

      // Validação específica dos nós esperados
      const nodes = result.trace.map((e: TraceEvent) => e.node);
      assert.ok(nodes.includes('roteador'), 'Deve conter evento do nó roteador');
      assert.ok(nodes.includes('react'), 'Deve conter eventos do nó react');
      assert.ok(nodes.includes('resposta'), 'Deve conter evento do nó resposta');
    });
  });

  describe('Integração com Contexto e Orçamento (runProductionGraph)', () => {
    test('executa o pipeline completo repassando builtContext e métricas', async () => {
      const mockModel = createMockRouterModel({
        route: 'react',
        reason: 'Pipeline completo',
      });

      const mockReact = createMockStrategy('react', 'Resposta final integrada');
      const contextBuilder = new ContextBuilder();

      const result = await runProductionGraph(
        {
          message: 'Status dos serviços',
          history: [{ role: 'user', content: 'Olá' }, { role: 'assistant', content: 'Olá!' }],
        },
        {
          model: mockModel,
          reactStrategy: mockReact,
          contextBuilder,
        }
      );

      assert.equal(result.answer, 'Resposta final integrada');
      assert.equal(result.route, 'react');
      assert.ok(result.builtContext, 'builtContext deve ser produzido');
      assert.ok(result.metrics.contextBreakdown, 'contextBreakdown deve estar presente nas métricas');
    });

    test('SYSTEM_PROMPT contém a tabela de critérios operacionais incluindo team', () => {
      assert.ok(SYSTEM_PROMPT.includes('| Estratégia | Quando Usar | Critérios e Exemplos |'));
      assert.ok(SYSTEM_PROMPT.includes('| react |'));
      assert.ok(SYSTEM_PROMPT.includes('| planExecute |'));
      assert.ok(SYSTEM_PROMPT.includes('| reflect |'));
      assert.ok(SYSTEM_PROMPT.includes('| team |'));
    });

    test('roteia para "team" quando selecionado pelo modelo ou via override', async () => {
      const mockModel = createMockRouterModel({
        route: 'team',
        reason: 'Incidente complexo de checkout',
      });

      const mockTeam = createMockStrategy('team', 'Incidente mitigado pela equipe', [
        {
          kind: 'handoff',
          from: 'supervisor',
          to: 'analista',
          brief: 'Investigue o checkout',
          iteration: 1,
          content: 'Handoff para analista',
          timestampMs: Date.now(),
        },
      ]);

      const result = await runProductionGraph(
        {
          message: 'Trate o incidente no checkout com a equipe',
          strategyOverride: 'team',
        },
        {
          model: mockModel,
          teamStrategy: mockTeam,
        }
      );

      assert.equal(result.route, 'team');
      assert.equal(result.isOverride, true);
      assert.equal(result.answer, 'Incidente mitigado pela equipe');

      const handoff = result.trace.find((e) => e.kind === 'handoff');
      assert.ok(handoff, 'Deve propagar o evento handoff');
      assert.equal(handoff?.to, 'analista');
    });
  });
});
