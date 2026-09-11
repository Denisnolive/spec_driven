import React from 'react';
import type { ChatMessage, ApprovalAction } from '../types/chat';
import { ApprovalCard } from './ApprovalCard';

interface ChatMessageItemProps {
  message: ChatMessage;
  onOpenTrace: (message: ChatMessage) => void;
  onApproveAction: (action: ApprovalAction) => Promise<void> | void;
  onRejectAction: (action: ApprovalAction) => Promise<void> | void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  onOpenTrace,
  onApproveAction,
  onRejectAction,
}) => {
  const isUser = message.sender === 'user';
  const hasTrace = (message.trace && message.trace.length > 0) || Boolean(message.requestId);

  // Renderiza blocos de código com destaque simples
  const renderMessageContent = (text: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        const firstLine = lines[0]?.trim() || '';
        const hasLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
        const code = hasLang ? lines.slice(1).join('\n') : lines.join('\n');

        return (
          <div key={index} className="code-block-container">
            {hasLang && <div className="code-block-lang">{firstLine}</div>}
            <pre className="code-block">
              <code>{code}</code>
            </pre>
          </div>
        );
      }
      return <p key={index} className="message-paragraph">{part}</p>;
    });
  };

  return (
    <div
      className={`chat-message-wrapper message-${message.sender}`}
      role="article"
      aria-label={`Mensagem de ${isUser ? 'Você' : 'OpsPilot'}`}
    >
      <div className="chat-avatar" aria-hidden="true">
        {isUser ? (
          <span>👤</span>
        ) : (
          <span className="bot-avatar-icon">⚡</span>
        )}
      </div>

      <div className="chat-bubble">
        <div className="chat-sender-header">
          <span className="sender-name">{isUser ? 'Você' : 'OpsPilot'}</span>
          <span className="message-time">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {message.status === 'sending' && (
            <span className="status-indicator sending">Enviando...</span>
          )}
          {message.status === 'error' && (
            <span className="status-indicator error">Erro</span>
          )}
        </div>

        <div className="chat-text-content">
          {renderMessageContent(message.text)}
        </div>

        {/* Se a mensagem incluir requisição de aprovação 202 */}
        {message.approval && (
          <div className="chat-approval-container">
            <ApprovalCard
              approval={message.approval}
              onApprove={onApproveAction}
              onReject={onRejectAction}
            />
          </div>
        )}

        {/* Rodapé com métricas e botão "Ver raciocínio" para mensagens do assistente */}
        {!isUser && (
          <div className="chat-assistant-footer">
            <div className="assistant-metrics">
              {message.metrics?.latencyMs !== undefined && (
                <span className="metric-tag" title="Tempo de resposta do agente">
                  ⏱ {message.metrics.latencyMs}ms
                </span>
              )}
              {message.metrics?.modelUsed && (
                <span className="metric-tag" title="Modelo LLM utilizado">
                  🤖 {message.metrics.modelUsed.split('/').pop()}
                </span>
              )}
              {message.metrics?.totalTokens !== undefined && (
                <span className="metric-tag" title="Tokens totais">
                  🪙 {message.metrics.totalTokens} tok
                </span>
              )}
            </div>

            {hasTrace && (
              <button
                type="button"
                className="btn-see-reasoning"
                onClick={() => onOpenTrace(message)}
                title="Abrir detalhes e eventos de raciocínio da requisição"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>Ver raciocínio</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
