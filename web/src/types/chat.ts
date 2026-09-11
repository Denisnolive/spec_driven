// ─── Tipos do Chat e Raciocínio (War Room) ───────────────────────────────────

export interface TraceEventRecord {
  id?: number;
  requestId: string;
  seq: number;
  kind: string;
  type?: string;
  node?: string;
  payload: unknown;
  timestampMs: number;
  createdAt?: string;
  from?: string;
  to?: string;
  brief?: string;
  iteration?: number;
}

export interface RequestRecord {
  id: string;
  conversationId?: string;
  userId?: string;
  message?: string;
  answer?: string;
  route?: string;
  statusCode: number;
  status: string;
  latencyMs?: number;
  llmCalls?: number;
  modelUsed?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  createdAt?: string;
}

export interface MessageMetrics {
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  modelUsed?: string;
  llmCalls?: number;
  historyMessages?: number;
}

export interface ApprovalAction {
  actionId: string;
  actionName: string;
  service: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  params?: Record<string, unknown>;
  decision: 'pending' | 'approved' | 'rejected';
  decidedAt?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  requestId?: string;
  conversationId?: string;
  status?: 'sending' | 'success' | 'error' | 'awaiting_approval' | 'approved' | 'rejected';
  trace?: TraceEventRecord[];
  metrics?: MessageMetrics;
  approval?: ApprovalAction;
}

export interface ChatApiSuccessResponse {
  requestId: string;
  answer: string;
  trace: Array<{
    kind: string;
    content?: unknown;
    timestampMs?: number;
    node?: string;
    [key: string]: unknown;
  }>;
  metrics: {
    latencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    modelUsed?: string;
    llmCalls?: number;
    historyMessages?: number;
    [key: string]: unknown;
  };
  conversationId: string;
}

export interface ChatApiApprovalResponse {
  requiresApproval: true;
  requestId: string;
  actionId: string;
  actionName: string;
  service: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  params?: Record<string, unknown>;
  conversationId?: string;
}
