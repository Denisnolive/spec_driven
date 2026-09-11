import {
  DEFAULT_API_BASE_URL,
  STORAGE_KEY_API_URL,
} from '../types/config';
import type {
  ChatApiSuccessResponse,
  ChatApiApprovalResponse,
  TraceEventRecord,
  RequestRecord,
} from '../types/chat';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY_API_URL);
    if (saved && saved.trim().length > 0) {
      return saved.trim().replace(/\/+$/, '');
    }
  }
  return DEFAULT_API_BASE_URL;
}

export function setApiBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_API_URL, url.trim().replace(/\/+$/, ''));
  }
}

export interface SendChatParams {
  message: string;
  conversationId?: string;
  userId?: string;
  strategy?: string;
}

export type SendChatResult =
  | { type: 'success'; data: ChatApiSuccessResponse }
  | { type: 'approval_required'; data: ChatApiApprovalResponse };

export async function sendChatMessage(params: SendChatParams): Promise<SendChatResult> {
  const baseUrl = getApiBaseUrl();
  const endpoint = `${baseUrl}/chat`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const requestIdHeader = response.headers.get('x-request-id') || '';

  // Status 202: Ação requer autorização humana (Human-in-the-loop)
  if (response.status === 202) {
    const data = (await response.json()) as Partial<ChatApiApprovalResponse>;
    return {
      type: 'approval_required',
      data: {
        requiresApproval: true,
        requestId: data.requestId || requestIdHeader,
        actionId: data.actionId || `action-${Date.now()}`,
        actionName: data.actionName || 'Ação Operacional',
        service: data.service || 'infraestrutura',
        severity: data.severity || 'high',
        summary: data.summary || 'Ação operacional aguardando autorização humana.',
        params: data.params || {},
        conversationId: data.conversationId || params.conversationId,
      },
    };
  }

  if (!response.ok) {
    let errorMessage = `Erro HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.message) {
        errorMessage = errJson.message;
      } else if (errJson.error) {
        errorMessage = errJson.error;
      }
    } catch {
      // Falha ao parsear JSON de erro
    }
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as ChatApiSuccessResponse;
  return {
    type: 'success',
    data: {
      ...data,
      requestId: data.requestId || requestIdHeader,
    },
  };
}

export async function fetchRequestTrace(requestId: string): Promise<{
  request: RequestRecord;
  trace: TraceEventRecord[];
}> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/requests/${encodeURIComponent(requestId)}`);
  if (!response.ok) {
    throw new Error(`Falha ao carregar trace da requisição ${requestId} (HTTP ${response.status})`);
  }
  return (await response.json()) as {
    request: RequestRecord;
    trace: TraceEventRecord[];
  };
}

export async function checkApiHealth(): Promise<{ ok: boolean; message?: string }> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/stats?since=1h`, {
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) {
      return { ok: true };
    }
    return { ok: false, message: `Status HTTP ${response.status}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Falha na conexão' };
  }
}
