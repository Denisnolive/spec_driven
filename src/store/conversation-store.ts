import { randomUUID } from 'node:crypto';

// ─── Tipos de Dados ───────────────────────────────────────────────────────────

export interface MessageData {
  id: number;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ConversationData {
  id: string; // UUIDv4
  created_at: string;
}

export interface ConversationSummaryData {
  conversation_id: string;
  summary: string;
  summarized_messages_count: number;
  updated_at: string;
}

// ─── Interface de Persistência de Conversas ───────────────────────────────────

export interface ConversationStore {
  /** Cria uma nova conversa e retorna o conversationId (UUIDv4). */
  create(): string;

  /** Persiste uma mensagem numa conversa existente. */
  append(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
  ): MessageData;

  /** Retorna as últimas N mensagens de uma conversa em ordem cronológica (ASC). */
  lastMessages(conversationId: string, limit: number): MessageData[];

  /** Retorna o total de mensagens de uma conversa. */
  countMessages(conversationId: string): number;

  /** Retorna um intervalo de mensagens (ordem cronológica ASC) com offset e limit. */
  getMessagesRange(conversationId: string, offset: number, limit: number): MessageData[];

  /** Obtém o resumo salvo de uma conversa, ou null se não houver. */
  getSummary(conversationId: string): ConversationSummaryData | null;

  /** Salva ou atualiza o resumo de uma conversa com a contagem de mensagens incorporadas. */
  saveSummary(
    conversationId: string,
    summary: string,
    summarizedMessagesCount: number
  ): void;

  /** Verifica se uma conversa existe. */
  exists(conversationId: string): boolean;
}

// ─── Implementação em Memória (testes e benchmarks) ───────────────────────────

/**
 * Implementação em memória de ConversationStore para cenários de teste e benchmarks.
 */
export class InMemoryConversationStore implements ConversationStore {
  private conversations = new Map<string, ConversationData>();
  private messages: MessageData[] = [];
  private summaries = new Map<string, ConversationSummaryData>();
  private nextMessageId = 1;

  create(): string {
    const id = randomUUID();
    this.conversations.set(id, {
      id,
      created_at: new Date().toISOString(),
    });
    return id;
  }

  append(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
  ): MessageData {
    if (!this.conversations.has(conversationId)) {
      throw new Error(
        `FOREIGN KEY constraint failed: conversation ${conversationId} não encontrada`
      );
    }

    const msg: MessageData = {
      id: this.nextMessageId++,
      conversation_id: conversationId,
      role,
      content,
      created_at: new Date().toISOString(),
    };
    this.messages.push(msg);
    return { ...msg };
  }

  lastMessages(conversationId: string, limit: number): MessageData[] {
    const convMessages = this.messages.filter(
      (m) => m.conversation_id === conversationId
    );

    // Pega as últimas N em ordem de inserção (id crescente = cronológico)
    const start = Math.max(0, convMessages.length - limit);
    return convMessages.slice(start).map((m) => ({ ...m }));
  }

  countMessages(conversationId: string): number {
    return this.messages.filter((m) => m.conversation_id === conversationId).length;
  }

  getMessagesRange(conversationId: string, offset: number, limit: number): MessageData[] {
    const convMessages = this.messages.filter(
      (m) => m.conversation_id === conversationId
    );
    return convMessages.slice(offset, offset + limit).map((m) => ({ ...m }));
  }

  getSummary(conversationId: string): ConversationSummaryData | null {
    const summary = this.summaries.get(conversationId);
    return summary ? { ...summary } : null;
  }

  saveSummary(
    conversationId: string,
    summary: string,
    summarizedMessagesCount: number
  ): void {
    if (!this.conversations.has(conversationId)) {
      throw new Error(
        `FOREIGN KEY constraint failed: conversation ${conversationId} não encontrada`
      );
    }

    this.summaries.set(conversationId, {
      conversation_id: conversationId,
      summary,
      summarized_messages_count: summarizedMessagesCount,
      updated_at: new Date().toISOString(),
    });
  }

  exists(conversationId: string): boolean {
    return this.conversations.has(conversationId);
  }
}
