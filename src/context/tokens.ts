// ─── Tipos e Interfaces de Medição de Contexto ───────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ContextBreakdown {
  userMessage: number;
  history: number;
  memories: number;
  summary: number;
  totalEstimated: number;
}

// ─── Estimativa Heurística de Tokens ──────────────────────────────────────────

/**
 * Estima a quantidade de tokens a partir do comprimento do texto (heurística chars / 4).
 * Retorna 0 para strings vazias ou indefinidas.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text || text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

// ─── Extração de Usage Real do LangChain ───────────────────────────────────────

/**
 * Extrai o consumo real de tokens a partir das mensagens de resposta do LangChain.
 * Inspeciona usage_metadata e response_metadata.token_usage de cada mensagem.
 */
export function extractTokenUsage(messages: unknown[]): TokenUsage {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  if (!Array.isArray(messages)) {
    return { promptTokens, completionTokens, totalTokens };
  }

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') {
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = msg as Record<string, any>;

    // 1. Formato usage_metadata (padrão LangChain)
    if (m.usage_metadata && typeof m.usage_metadata === 'object') {
      const u = m.usage_metadata;
      promptTokens += Number(u.input_tokens || u.prompt_tokens || 0);
      completionTokens += Number(u.output_tokens || u.completion_tokens || 0);
      totalTokens += Number(u.total_tokens || 0);
    }
    // 2. Formato response_metadata.token_usage (OpenAI / OpenRouter)
    else if (
      m.response_metadata?.token_usage &&
      typeof m.response_metadata.token_usage === 'object'
    ) {
      const u = m.response_metadata.token_usage;
      promptTokens += Number(u.prompt_tokens || u.input_tokens || 0);
      completionTokens += Number(u.completion_tokens || u.output_tokens || 0);
      totalTokens += Number(u.total_tokens || 0);
    }
  }

  if (totalTokens === 0 && (promptTokens > 0 || completionTokens > 0)) {
    totalTokens = promptTokens + completionTokens;
  }

  return { promptTokens, completionTokens, totalTokens };
}

// ─── Cálculo de Quebra de Contexto por Fonte ──────────────────────────────────

export interface CalculateContextBreakdownParams {
  userMessage: string;
  history?: Array<{ role: string; content: string }>;
  memories?: Array<{ fact: string } | string>;
  summary?: string | null;
}

/**
 * Calcula a discriminação estimada de tokens por fonte de contexto (mensagem atual, histórico, memórias e resumo).
 */
export function calculateContextBreakdown(
  params: CalculateContextBreakdownParams
): ContextBreakdown {
  const userMessageTokens = estimateTokens(params.userMessage);

  let historyTokens = 0;
  if (Array.isArray(params.history)) {
    for (const h of params.history) {
      historyTokens += estimateTokens(`${h.role}: ${h.content}`);
    }
  }

  let memoriesTokens = 0;
  if (Array.isArray(params.memories) && params.memories.length > 0) {
    for (const m of params.memories) {
      const fact = typeof m === 'string' ? m : m.fact;
      memoriesTokens += estimateTokens(`- ${fact}`);
    }
    // Inclui a linha de cabeçalho do bloco de memórias
    memoriesTokens += estimateTokens('[Memórias do Usuário]\n');
  }

  let summaryTokens = 0;
  if (params.summary) {
    summaryTokens = estimateTokens(
      `[Resumo da Conversa Anterior]\n${params.summary}\n\n`
    );
  }

  const totalEstimated =
    userMessageTokens + historyTokens + memoriesTokens + summaryTokens;

  return {
    userMessage: userMessageTokens,
    history: historyTokens,
    memories: memoriesTokens,
    summary: summaryTokens,
    totalEstimated,
  };
}
