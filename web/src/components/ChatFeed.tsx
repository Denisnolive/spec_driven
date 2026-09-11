import React, { useEffect, useRef } from 'react';
import type { ChatMessage, ApprovalAction } from '../types/chat';
import { ChatMessageItem } from './ChatMessageItem';

interface ChatFeedProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onOpenTrace: (message: ChatMessage) => void;
  onApproveAction: (action: ApprovalAction) => Promise<void> | void;
  onRejectAction: (action: ApprovalAction) => Promise<void> | void;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({
  messages,
  isLoading,
  onOpenTrace,
  onApproveAction,
  onRejectAction,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div
      className="chat-feed"
      role="log"
      aria-live="polite"
      aria-label="Histórico de conversação da War Room"
    >
      {messages.map((msg) => (
        <ChatMessageItem
          key={msg.id}
          message={msg}
          onOpenTrace={onOpenTrace}
          onApproveAction={onApproveAction}
          onRejectAction={onRejectAction}
        />
      ))}

      {isLoading && (
        <div className="chat-message-wrapper message-assistant typing-wrapper" role="status" aria-label="OpsPilot está pensando">
          <div className="chat-avatar" aria-hidden="true">
            <span className="bot-avatar-icon">⚡</span>
          </div>
          <div className="chat-bubble typing-bubble">
            <div className="typing-indicator" aria-hidden="true">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
            <span className="typing-label">OpsPilot está diagnosticando...</span>
          </div>
        </div>
      )}

      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
};
