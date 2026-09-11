import { EventEmitter } from 'node:events';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type {
  ConversationStore,
  ConversationSummaryData,
  MessageData,
} from '../store/conversation-store.js';

// ─── Constantes e Prompt de Sumarização ───────────────────────────────────────

export const RECENT_WINDOW = 8;
export const SUMMARY_BATCH_SIZE = 8;

export const SUMMARIZER_PROMPT = `Comprima o trecho de conversa a seguir em no máximo 150 tokens, preservando obrigatoriamente: decisões tomadas, fatos estabelecidos (nomes, datas, prazos, preferências), incidentes abertos/resolvidos e pendências abertas. Descarte cumprimentos e conversa social. Se houver um resumo anterior, incorpore-o ao novo resumo sem duplicar informações. Responda só o resumo, em tópicos telegráficos.`;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SummarizeEvent {
  conversationId: string;
  oldSummary: string | null;
  newSummary: string;
  messagesSummarized: number;
  totalMessages: number;
}

export interface SummarizerClient {
  summarize(systemInstruction: string, input: string): Promise<string>;
}

// ─── Implementações de SummarizerClient ────────────────────────────────────────

/**
 * Cliente Fake determinístico para testes unitários e de integração.
 */
export class FakeSummarizer implements SummarizerClient {
  public callCount = 0;
  public calls: Array<{ systemInstruction: string; input: string }> = [];
  private readonly responseGenerator?: (callIndex: number, input: string) => string;

  constructor(responseGenerator?: (callIndex: number, input: string) => string) {
    this.responseGenerator = responseGenerator;
  }

  async summarize(systemInstruction: string, input: string): Promise<string> {
    this.callCount++;
    this.calls.push({ systemInstruction, input });
    if (this.responseGenerator) {
      return this.responseGenerator(this.callCount, input);
    }
    return `Resumo fake #${this.callCount}: decisões e fatos preservados.`;
  }
}

/**
 * Cliente de produção utilizando LangChain e OpenAI (gpt-4o-mini).
 */
export class OpenAISummarizer implements SummarizerClient {
  private readonly model: BaseChatModel;

  constructor(model?: BaseChatModel) {
    this.model =
      model ??
      new ChatOpenAI({
        modelName: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        temperature: 0,
      });
  }

  async summarize(systemInstruction: string, input: string): Promise<string> {
    const response = await this.model.invoke([
      new SystemMessage(systemInstruction),
      new HumanMessage(input),
    ]);
    return typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
  }
}

// ─── Formatador de Entrada para o Sumarizador ─────────────────────────────────

export function formatSummarizerInput(
  oldSummary: string | null | undefined,
  messagesToSummarize: MessageData[]
): string {
  let text = '';
  if (oldSummary && oldSummary.trim().length > 0) {
    text += `Resumo anterior:\n${oldSummary.trim()}\n\n`;
  }
  text += 'Novas mensagens a incorporar:\n';
  for (const m of messagesToSummarize) {
    text += `${m.role}: ${m.content}\n`;
  }
  return text.trim();
}

// ─── Motor de Sumarização e Poda de Histórico ──────────────────────────────────

export interface HistorySummarizerOptions {
  store: ConversationStore;
  client?: SummarizerClient;
  recentWindow?: number;
  batchSize?: number;
}

/**
 * Gerencia a poda da janela de histórico e a sumarização incremental em lote.
 * Emite o evento 'summarize' sempre que um novo resumo consolidado é gerado.
 */
export class HistorySummarizer extends EventEmitter {
  private readonly store: ConversationStore;
  private readonly client: SummarizerClient;
  readonly recentWindow: number;
  readonly batchSize: number;

  constructor(options: HistorySummarizerOptions) {
    super();
    this.store = options.store;
    this.client = options.client ?? new OpenAISummarizer();
    this.recentWindow = options.recentWindow ?? RECENT_WINDOW;
    this.batchSize = options.batchSize ?? SUMMARY_BATCH_SIZE;
  }

  /**
   * Verifica se há mensagens podadas suficientes (>= batchSize) fora da janela recente
   * para gerar um novo resumo mesclado. Se não houver, retorna o resumo atual sem custo de LLM.
   */
  async checkAndSummarize(
    conversationId: string
  ): Promise<ConversationSummaryData | null> {
    const totalMessages = this.store.countMessages(conversationId);
    const currentSummary = this.store.getSummary(conversationId);
    const alreadySummarized = currentSummary?.summarized_messages_count ?? 0;

    // Total de mensagens que já saíram da janela recente de 8
    const totalOutsideRecentWindow = Math.max(0, totalMessages - this.recentWindow);
    const pendingToSummarize = totalOutsideRecentWindow - alreadySummarized;

    // Só reprocessa quando 8 novas saem da janela (nunca a cada request!)
    if (pendingToSummarize < this.batchSize) {
      return currentSummary;
    }

    // Busca exatamente o lote de mensagens pendentes a serem incorporadas
    const messagesToSummarize = this.store.getMessagesRange(
      conversationId,
      alreadySummarized,
      pendingToSummarize
    );

    if (messagesToSummarize.length === 0) {
      return currentSummary;
    }

    const input = formatSummarizerInput(
      currentSummary?.summary,
      messagesToSummarize
    );

    const newSummaryText = await this.client.summarize(SUMMARIZER_PROMPT, input);

    const newSummarizedCount = alreadySummarized + pendingToSummarize;
    this.store.saveSummary(conversationId, newSummaryText, newSummarizedCount);

    const eventPayload: SummarizeEvent = {
      conversationId,
      oldSummary: currentSummary?.summary ?? null,
      newSummary: newSummaryText,
      messagesSummarized: pendingToSummarize,
      totalMessages,
    };

    this.emit('summarize', eventPayload);

    return this.store.getSummary(conversationId);
  }
}
