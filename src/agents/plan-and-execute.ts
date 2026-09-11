import { Annotation, StateGraph, END, START } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import type { ReasoningStrategy, StrategyResult, TraceEvent, StrategyInput } from './types.js';
import { normalizeInput } from './types.js';
import { createModel } from './model.js';
import { opsTools } from './tools.js';

// ─── Opções ───────────────────────────────────────────────────────────────────

export interface PlanAndExecuteOptions {
  /** Número máximo de passos permitidos. Padrão: 8. */
  maxSteps?: number;
  /** Se deve executar o nó de replanejamento entre os passos. Padrão: true. */
  replanner?: boolean;
}

// ─── Schema do planner (saída estruturada) ────────────────────────────────────

const PlanSchema = z.object({
  steps: z
    .array(z.string())
    .describe('Lista ordenada de passos concretos para completar a tarefa'),
});

// ─── Anotações de estado do grafo ─────────────────────────────────────────────

const StateAnnotation = Annotation.Root({
  /** Tarefa original do usuário */
  input: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),
  /** Plano atual (passos pendentes) */
  plan: Annotation<string[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  /** Passos já executados e seus resultados */
  pastSteps: Annotation<Array<{ step: string; result: string }>>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  /** Resposta final (vazia enquanto em execução) */
  response: Annotation<string>({
    reducer: (_, b) => b ?? '',
    default: () => '',
  }),
  /** Trace acumulado de eventos */
  trace: Annotation<TraceEvent[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  /** Contador de chamadas LLM */
  llmCalls: Annotation<number>({
    reducer: (a, b) => a + b,
    default: () => 0,
  }),
});

type GraphState = typeof StateAnnotation.State;

// ─── Estratégia Plan-and-Execute ──────────────────────────────────────────────

/**
 * Grafo com 3 nós:
 *  planner   → gera lista de passos (saída estruturada Zod)
 *  executor  → executa 1 passo por vez usando as tools (mini-agente ReAct)
 *  replanner → revisa passos restantes; encerra quando não sobra nada
 */
export class PlanAndExecuteStrategy implements ReasoningStrategy {
  readonly name = 'plan-and-execute';
  private readonly maxSteps: number;
  private readonly enableReplanner: boolean;

  constructor(options: PlanAndExecuteOptions = {}) {
    this.maxSteps = options.maxSteps ?? 8;
    this.enableReplanner = options.replanner ?? true;
  }

  async run(rawInput: string | StrategyInput): Promise<StrategyResult> {
    const { message: input, history = [] } = normalizeInput(rawInput);
    const startMs = Date.now();
    const model = createModel();
    const maxSteps = this.maxSteps;
    const enableReplanner = this.enableReplanner;

    // Prepara contexto de histórico para o planner
    const historyContext = history.length > 0
      ? '\n\nHistórico da conversa:\n' +
        history.map((h) => `${h.role}: ${h.content}`).join('\n') +
        '\n'
      : '';

    // ── Nó Planner ───────────────────────────────────────────────────────────
    const planner = model.withStructuredOutput(PlanSchema);

    async function plannerNode(state: GraphState): Promise<Partial<GraphState>> {
      const rawResult = (await planner.invoke([
        {
          role: 'system' as const,
          content:
            `Você é o assistente de planejamento do OpsPilot, copiloto de operações e SRE. ` +
            `Divida a tarefa do usuário em no máximo ${maxSteps} passos concretos que serão executados AUTOMATICAMENTE através das ferramentas do OpsPilot: ` +
            `- list_alerts: listar alertas de monitoramento da infraestrutura ` +
            `- list_incidents: listar incidentes em aberto ou resolvidos ` +
            `- open_incident: abrir um novo incidente operacional (requer title, service, severity: low, medium, high, critical) ` +
            `- resolve_incident: marcar incidente como resolvido por ID ` +
            `- consultar_runbook: buscar procedimentos e instruções do runbook de um serviço ` +
            `- check_provider_status: verificar saúde de provedores externos (github, cloudflare) ` +
            `NUNCA planeje passos manuais para o usuário acessar interfaces externas (como ServiceNow, Jira ou PagerDuty). ` +
            `Todos os passos devem focar em usar as ferramentas internas do OpsPilot.`,
        },
        { role: 'user' as const, content: state.input + historyContext },
      ])) as any;

      let steps: string[] = [];
      if (rawResult && Array.isArray(rawResult.steps)) {
        steps = rawResult.steps;
      } else if (rawResult && typeof rawResult.content === 'string') {
        const lines = rawResult.content
          .split('\n')
          .map((l: string) => l.replace(/^\d+[\.\)]\s*/, '').replace(/^[-*]\s*/, '').trim())
          .filter((l: string) => l.length > 0);
        steps = lines.length > 0 ? lines : [state.input];
      } else {
        steps = [state.input];
      }

      const finalSteps = steps.slice(0, maxSteps);

      return {
        plan: finalSteps,
        llmCalls: 1,
        trace: [
          {
            kind: 'plan',
            content: finalSteps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
            timestampMs: Date.now(),
          },
        ],
      };
    }

    // ── Nó Executor ──────────────────────────────────────────────────────────
    const stepAgent = createReactAgent({
      llm: model as any,
      tools: opsTools,
      messageModifier:
        'Você é o OpsPilot, executor de operações com acesso a ferramentas internas da infraestrutura. ' +
        'Complete o passo a seguir usando as ferramentas disponíveis (open_incident, list_incidents, list_alerts, consultar_runbook, check_provider_status). ' +
        'NUNCA diga que não tem acesso a sistemas internos.',
    });

    async function executorNode(state: GraphState): Promise<Partial<GraphState>> {
      const [currentStep, ...remainingPlan] = state.plan;
      if (!currentStep) return { response: 'Nenhum passo a executar.' };

      const trace: TraceEvent[] = [];
      let llmCalls = 0;

      // Usa mini-agente ReAct para executar o passo
      const eventStream = stepAgent.streamEvents(
        {
          messages: [
            {
              role: 'system' as const,
              content:
                'Você é o OpsPilot, executor de operações com acesso a ferramentas internas. Complete o passo a seguir usando as ferramentas disponíveis.',
            },
            { role: 'user' as const, content: currentStep },
          ],
        },
        { version: 'v2', recursionLimit: 10 }
      );

      let stepResult = '';

      for await (const event of eventStream) {
        const { event: evType, data, name: evName } = event;

        if (evType === 'on_chat_model_start') llmCalls++;

        if (evType === 'on_tool_start') {
          trace.push({
            kind: 'action',
            content: {
              tool: evName ?? 'unknown',
              args: (data?.input as Record<string, unknown>) ?? {},
            },
            timestampMs: Date.now(),
          });
        }

        if (evType === 'on_tool_end') {
          const raw = data?.output;
          trace.push({
            kind: 'observation',
            content: typeof raw === 'string' ? raw : JSON.stringify(raw ?? ''),
            timestampMs: Date.now(),
          });
        }

        if (evType === 'on_chain_end' && evName === 'LangGraph') {
          const messages: unknown[] =
            (data?.output?.messages as unknown[]) ?? [];
          if (messages.length > 0) {
            const last = messages[messages.length - 1] as { content?: unknown };
            stepResult =
              typeof last?.content === 'string'
                ? last.content
                : JSON.stringify(last?.content ?? '');
          }
        }
      }

      return {
        plan: remainingPlan,
        pastSteps: [{ step: currentStep, result: stepResult }],
        llmCalls,
        trace,
      };
    }

    // ── Nó Replanner ─────────────────────────────────────────────────────────
    const replanner = model.withStructuredOutput(PlanSchema);

    async function replannerNode(state: GraphState): Promise<Partial<GraphState>> {
      const doneSummary = state.pastSteps
        .map((s) => `- ${s.step}\n  Resultado: ${s.result}`)
        .join('\n');

      // Plano vazio → gera resposta final
      if (state.plan.length === 0) {
        const response = (await model.invoke([
          {
            role: 'system' as const,
            content:
              'Você é o OpsPilot. Resuma os resultados das operações executadas em uma resposta final concisa em português do Brasil.',
          },
          {
            role: 'user' as const,
            content:
              `Tarefa original: ${state.input}\n\n` +
              `Passos executados:\n${doneSummary}`,
          },
        ])) as { content: any };

        const answer =
          typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);

        return {
          response: answer,
          llmCalls: 1,
          trace: [
            {
              kind: 'answer',
              content: answer,
              timestampMs: Date.now(),
            },
          ],
        };
      }

      // Se o replanner estiver desativado, apenas avança para o próximo passo sem chamar LLM
      if (!enableReplanner) {
        return {
          plan: state.plan,
          llmCalls: 0,
          trace: [],
        };
      }

      // Revisa plano restante
      let revisedSteps: string[] = [];
      try {
        const revised = (await replanner.invoke([
          {
            role: 'system' as const,
            content:
              'Você é um replanner. Revise os passos restantes com base no que já foi feito. ' +
              'Remova passos desnecessários ou redundantes. ' +
              'Retorne lista vazia se a tarefa já estiver completa.',
          },
          {
            role: 'user' as const,
            content:
              `Tarefa: ${state.input}\n\n` +
              `Concluído:\n${doneSummary}\n\n` +
              `Plano restante:\n${state.plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
          },
        ])) as any;

        if (revised && Array.isArray(revised.steps)) {
          revisedSteps = revised.steps;
        } else if (revised && typeof revised.content === 'string') {
          const lines = revised.content
            .split('\n')
            .map((l: string) => l.replace(/^\d+[\.\)]\s*/, '').replace(/^[-*]\s*/, '').trim())
            .filter((l: string) => l.length > 0);
          revisedSteps = lines;
        } else {
          revisedSteps = state.plan;
        }
      } catch {
        revisedSteps = state.plan;
      }

      const trace: TraceEvent[] = [];
      if (revisedSteps.length > 0) {
        trace.push({
          kind: 'critique',
          content:
            `Plano revisado (${revisedSteps.length} passo(s)):\n` +
            revisedSteps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
          timestampMs: Date.now(),
        });
      }

      return {
        plan: revisedSteps.slice(0, maxSteps - state.pastSteps.length),
        llmCalls: 1,
        trace,
      };
    }

    // ── Roteamento condicional do replanner ───────────────────────────────────

    function shouldContinue(state: GraphState): 'executor' | typeof END {
      // Resposta gerada ou limite de passos atingido
      if (state.response || state.pastSteps.length >= maxSteps) return END;
      // Plano vazio → replanner vai gerar resposta final na próxima iteração
      if (state.plan.length === 0) return END;
      return 'executor';
    }

    // ── Construção do grafo ───────────────────────────────────────────────────

    const graph = new StateGraph(StateAnnotation)
      .addNode('planner', plannerNode)
      .addNode('executor', executorNode)
      .addNode('replanner', replannerNode)
      .addEdge(START, 'planner')
      .addEdge('planner', 'executor')
      .addEdge('executor', 'replanner')
      .addConditionalEdges('replanner', shouldContinue)
      .compile();

    // ── Execução ──────────────────────────────────────────────────────────────

    const finalState = await graph.invoke({ input });

    // Se o plano esgotou sem resposta (emergência), gera uma sumária básica
    const answer =
      finalState.response ||
      `Executados ${finalState.pastSteps.length} passo(s) sem conclusão explícita.`;

    return {
      answer,
      trace: finalState.trace as TraceEvent[],
      metrics: {
        llmCalls: finalState.llmCalls as number,
        latencyMs: Date.now() - startMs,
      },
    };
  }
}

export const planAndExecuteStrategy: ReasoningStrategy = new PlanAndExecuteStrategy();
