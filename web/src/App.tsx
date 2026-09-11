import React, { useState, useEffect, useCallback } from 'react';
import type { ChatMessage, ApprovalAction } from './types/chat';
import type { ThemeMode } from './types/config';
import { STORAGE_KEY_THEME } from './types/config';
import {
  sendChatMessage,
  checkApiHealth,
} from './services/api';
import { Header } from './components/Header';
import { ChatFeed } from './components/ChatFeed';
import { EmptyState } from './components/EmptyState';
import { ErrorBanner } from './components/ErrorBanner';
import { TraceDrawer } from './components/TraceDrawer';
import { SettingsModal } from './components/SettingsModal';

export const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Tema
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_THEME) as ThemeMode;
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  // Status da Conexão
  const [apiStatus, setApiStatus] = useState<'online' | 'offline' | 'checking'>('checking');

  // Modais e Gavetas
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [traceDrawerState, setTraceDrawerState] = useState<{
    isOpen: boolean;
    message?: ChatMessage;
  }>({ isOpen: false });

  // Sincroniza tema com elemento html
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY_THEME, theme);
  }, [theme]);

  // Checa status da API periodicamente
  const verifyApiHealth = useCallback(async () => {
    setApiStatus('checking');
    const health = await checkApiHealth();
    setApiStatus(health.ok ? 'online' : 'offline');
  }, []);

  useEffect(() => {
    void verifyApiHealth();
    const interval = setInterval(verifyApiHealth, 30000);
    return () => clearInterval(interval);
  }, [verifyApiHealth]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Envio de mensagem
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || isLoading) return;

    setInputText('');
    setGlobalError(null);

    const userMsgId = `user-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: Date.now(),
      status: 'success',
      conversationId,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const result = await sendChatMessage({
        message: text,
        conversationId,
      });

      if (result.type === 'approval_required') {
        const approvalData = result.data;
        if (approvalData.conversationId) {
          setConversationId(approvalData.conversationId);
        }

        const approvalMessage: ChatMessage = {
          id: `approval-${Date.now()}`,
          sender: 'assistant',
          text: `Aviso operacional: A mitigação proposta requer autorização expressa do operador.`,
          timestamp: Date.now(),
          requestId: approvalData.requestId,
          conversationId: approvalData.conversationId,
          status: 'awaiting_approval',
          approval: {
            actionId: approvalData.actionId,
            actionName: approvalData.actionName,
            service: approvalData.service,
            severity: approvalData.severity,
            summary: approvalData.summary,
            params: approvalData.params,
            decision: 'pending',
          },
        };

        setMessages((prev) => [...prev, approvalMessage]);
      } else {
        const data = result.data;
        if (data.conversationId) {
          setConversationId(data.conversationId);
        }

        // Mapeia trace bruto para formato tipado
        const typedTrace = (data.trace || []).map((t, idx) => ({
          requestId: data.requestId,
          seq: idx + 1,
          kind: t.kind,
          node: t.node,
          payload: t.content ?? t,
          timestampMs: t.timestampMs ?? 0,
        }));

        const assistantMessage: ChatMessage = {
          id: `asst-${Date.now()}`,
          sender: 'assistant',
          text: data.answer,
          timestamp: Date.now(),
          requestId: data.requestId,
          conversationId: data.conversationId,
          status: 'success',
          trace: typedTrace,
          metrics: {
            latencyMs: data.metrics?.latencyMs,
            promptTokens: data.metrics?.promptTokens,
            completionTokens: data.metrics?.completionTokens,
            totalTokens: data.metrics?.totalTokens,
            modelUsed: data.metrics?.modelUsed,
            llmCalls: data.metrics?.llmCalls,
            historyMessages: data.metrics?.historyMessages,
          },
        };

        setMessages((prev) => [...prev, assistantMessage]);
      }
      setApiStatus('online');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Falha ao se comunicar com a API');
      setApiStatus('offline');
    } finally {
      setIsLoading(false);
    }
  };

  // Ação de Aprovação (Human-in-the-Loop)
  const handleApproveAction = async (action: ApprovalAction) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.approval && m.approval.actionId === action.actionId) {
          return {
            ...m,
            approval: {
              ...m.approval,
              decision: 'approved',
              decidedAt: Date.now(),
            },
          };
        }
        return m;
      })
    );

    // Notifica o agente da aprovação
    await handleSendMessage(
      `[CONFIRMAÇÃO OPERADOR] Ação aprovada: ${action.actionName} no serviço ${action.service}. Prossiga com a execução.`
    );
  };

  // Ação de Rejeição (Human-in-the-Loop)
  const handleRejectAction = async (action: ApprovalAction) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.approval && m.approval.actionId === action.actionId) {
          return {
            ...m,
            approval: {
              ...m.approval,
              decision: 'rejected',
              decidedAt: Date.now(),
            },
          };
        }
        return m;
      })
    );

    // Notifica o agente da negação
    await handleSendMessage(
      `[CANCELAMENTO OPERADOR] Ação ${action.actionName} no serviço ${action.service} foi negada. Não execute esta alteração e sugira um plano alternativo.`
    );
  };

  const handleResetConversation = () => {
    setMessages([]);
    setConversationId(undefined);
    setGlobalError(null);
  };

  const handleOpenTrace = (message: ChatMessage) => {
    setTraceDrawerState({
      isOpen: true,
      message,
    });
  };

  const handleCloseTrace = () => {
    setTraceDrawerState({ isOpen: false, message: undefined });
  };

  return (
    <div className="war-room-app">
      <Header
        apiStatus={apiStatus}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main className="chat-main-container">
        {globalError && (
          <ErrorBanner
            message={globalError}
            onRetry={() => {
              const lastUserMsg = [...messages].reverse().find((m) => m.sender === 'user');
              if (lastUserMsg) {
                void handleSendMessage(lastUserMsg.text);
              }
            }}
            onDismiss={() => setGlobalError(null)}
          />
        )}

        <div className="chat-scroll-area">
          {messages.length === 0 ? (
            <EmptyState onSelectPrompt={(prompt) => void handleSendMessage(prompt)} />
          ) : (
            <ChatFeed
              messages={messages}
              isLoading={isLoading}
              onOpenTrace={handleOpenTrace}
              onApproveAction={handleApproveAction}
              onRejectAction={handleRejectAction}
            />
          )}
        </div>

        <footer className="chat-input-footer">
          <form
            className="chat-input-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendMessage();
            }}
          >
            {messages.length > 0 && (
              <button
                type="button"
                className="btn-new-chat"
                onClick={handleResetConversation}
                title="Iniciar nova sessão de conversa"
              >
                + Nova Sessão
              </button>
            )}

            <div className="input-wrapper">
              <input
                type="text"
                className="chat-input-field"
                placeholder="Pergunte sobre alertas, consulte incidentes ou solicite runbooks..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isLoading}
                aria-label="Mensagem para o OpsPilot"
              />
            </div>

            <button
              type="submit"
              className="btn-send-message"
              disabled={isLoading || !inputText.trim()}
              aria-label="Enviar mensagem"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <span>Enviar</span>
            </button>
          </form>
        </footer>
      </main>

      <TraceDrawer
        isOpen={traceDrawerState.isOpen}
        onClose={handleCloseTrace}
        requestId={traceDrawerState.message?.requestId}
        trace={traceDrawerState.message?.trace}
        metrics={traceDrawerState.message?.metrics}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={() => void verifyApiHealth()}
      />
    </div>
  );
};

export default App;
