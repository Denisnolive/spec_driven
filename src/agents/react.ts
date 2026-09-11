import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { ReasoningStrategy, StrategyResult, TraceEvent, StrategyInput } from "./types.js";
import { normalizeInput } from "./types.js";
import { createModel } from "./model.js";
import { opsTools } from "./tools.js";
import { extractTokenUsage } from "../context/tokens.js";

// ─── Helpers de Extração ──────────────────────────────────────────────────────

export function lastText(messages: BaseMessage[] | unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as { content?: unknown; tool_calls?: unknown[] };
    if (msg && typeof msg.content === "string" && msg.content.trim()) {
      return msg.content;
    }
  }
  return "";
}

export function countAiMessages(messages: BaseMessage[] | unknown[]): number {
  let count = 0;
  for (const msg of messages) {
    if (
      msg instanceof AIMessage ||
      (msg as { _getType?: () => string })?._getType?.() === "ai" ||
      (msg as { role?: string })?.role === "assistant"
    ) {
      count++;
    }
  }
  return count;
}

export function toTrace(messages: BaseMessage[] | unknown[]): TraceEvent[] {
  const trace: TraceEvent[] = [];
  const now = Date.now();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as {
      content?: unknown;
      tool_calls?: Array<{ name: string; args: Record<string, unknown> }>;
      _getType?: () => string;
      name?: string;
    };

    const isAi =
      msg instanceof AIMessage ||
      msg?._getType?.() === "ai" ||
      (msg as { role?: string })?.role === "assistant";

    const isTool =
      msg instanceof ToolMessage ||
      msg?._getType?.() === "tool" ||
      (msg as { role?: string })?.role === "tool";

    if (isAi) {
      const toolCalls = msg.tool_calls ?? [];
      const contentStr =
        typeof msg.content === "string"
          ? msg.content
          : msg.content
          ? JSON.stringify(msg.content)
          : "";

      // Pensamento intermediário
      if (contentStr && toolCalls.length > 0) {
        trace.push({
          kind: "thought",
          content: contentStr,
          timestampMs: now,
        });
      }

      // Ações (ferramentas chamadas)
      for (const call of toolCalls) {
        trace.push({
          kind: "action",
          content: {
            tool: call.name,
            args: call.args ?? {},
          },
          timestampMs: now,
        });
      }

      // Se for a última mensagem sem tool_calls, é a resposta final
      if (toolCalls.length === 0 && contentStr && i === messages.length - 1) {
        trace.push({
          kind: "answer",
          content: contentStr,
          timestampMs: now,
        });
      } else if (toolCalls.length === 0 && contentStr) {
        trace.push({
          kind: "thought",
          content: contentStr,
          timestampMs: now,
        });
      }
    }

    if (isTool) {
      const contentStr =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content ?? "");

      trace.push({
        kind: "observation",
        content: contentStr,
        timestampMs: now,
      });
    }
  }

  return trace;
}

// ─── Estratégia ReAct ─────────────────────────────────────────────────────────

export interface ReActOptions {
  maxIterations?: number;
}

export const OPS_PILOT_SYSTEM_PROMPT = `Você é o OpsPilot, o copiloto de plantão e confiabilidade de infraestrutura (SRE/DevOps).
Você está diretamente integrado aos sistemas de monitoramento e bancos de dados da produção através de ferramentas operacionais dedicadas.

Diretrizes obrigatórias:
1. Você POSSUI ferramentas ativas para consultar e modificar a infraestrutura:
   - 'list_alerts': Para verificar alertas de monitoramento disparando ou resolvidos.
   - 'list_incidents': Para listar os incidentes abertos, resolvidos ou o histórico de chamados da produção.
   - 'open_incident': Para abrir imediatamente um novo incidente operacional (requer title, service, severity: 'low' | 'medium' | 'high' | 'critical').
   - 'resolve_incident': Para marcar um incidente como resolvido usando seu ID numérico.
   - 'consultar_runbook': Para consultar os procedimentos operacionais de um serviço (ex: api-gateway, auth-service, billing-service, checkout, payments, auth).
   - 'check_provider_status': Para consultar a saúde de provedores externos (github, cloudflare).
2. NUNCA diga que você não tem acesso a sistemas internos, a dados em tempo real ou que é apenas um modelo de linguagem sem visão da produção.
3. Se o operador pedir para ver alertas ou incidentes, EXECUTE a ferramenta 'list_alerts' ou 'list_incidents' antes de responder.
4. Se o operador pedir para abrir um incidente, EXECUTE a ferramenta 'open_incident'. Se o serviço não for informado com exatidão, deduza pelo contexto do alerta/runbook mais próximo e abra o incidente.
5. Responda em português do Brasil de forma concisa, profissional e orientada a operações.`;

export class ReActStrategy implements ReasoningStrategy {
  readonly name = "react";
  private readonly recursionLimit: number;

  constructor(options: ReActOptions = {}) {
    this.recursionLimit = (options.maxIterations ?? 10) * 2;
  }

  async run(input: string | StrategyInput): Promise<StrategyResult> {
    const { message, history = [], builtContext } = normalizeInput(input);
    const started = Date.now();
    const systemPrompt = builtContext?.systemPrompt || OPS_PILOT_SYSTEM_PROMPT;

    const agent = createReactAgent({
      llm: createModel() as any,
      tools: opsTools,
      messageModifier: systemPrompt,
    });

    // Usa messages de builtContext se disponível, senão monta a partir de systemPrompt + history + message
    let rawMessages: Array<{ role: string; content: string }>;
    if (builtContext && builtContext.messages.length > 0) {
      rawMessages = builtContext.messages.map((m) => ({ role: m.role, content: m.content }));
      // Garante que a primeira mensagem seja de sistema se não houver
      if (!rawMessages.some((m) => m.role === 'system')) {
        rawMessages.unshift({ role: 'system', content: systemPrompt });
      }
    } else {
      rawMessages = [
        { role: 'system', content: systemPrompt },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ];
    }

    const result = await agent.invoke(
      { messages: rawMessages },
      { recursionLimit: this.recursionLimit }
    ); // guardrail: nada de loop infinito

    const resultMessages = (result.messages ?? []) as BaseMessage[];
    const tokenUsage = extractTokenUsage(resultMessages);

    return {
      answer: lastText(resultMessages),
      trace: toTrace(resultMessages),
      metrics: {
        llmCalls: countAiMessages(resultMessages),
        latencyMs: Date.now() - started,
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        totalTokens: tokenUsage.totalTokens,
        contextBreakdown: builtContext?.breakdown,
        contextBudgetStats: builtContext?.stats,
      },
    };
  }
}

export const reactStrategy: ReasoningStrategy = new ReActStrategy();
