import React, { useEffect, useRef } from 'react';
import type { TraceEventRecord, MessageMetrics } from '../types/chat';

interface TraceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  requestId?: string;
  trace?: TraceEventRecord[];
  metrics?: MessageMetrics;
}

export const TraceDrawer: React.FC<TraceDrawerProps> = ({
  isOpen,
  onClose,
  requestId,
  trace = [],
  metrics,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Fecha com tecla Escape e gerencia foco
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyTraceJson = () => {
    navigator.clipboard.writeText(JSON.stringify({ requestId, metrics, trace }, null, 2));
  };

  return (
    <div
      className="drawer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <aside
        ref={drawerRef}
        className="trace-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trace-drawer-title"
      >
        <header className="trace-drawer-header">
          <div>
            <h2 id="trace-drawer-title" className="trace-drawer-title">
              Raciocínio e Trace de Execução
            </h2>
            {requestId && (
              <span className="trace-request-id" title="Identificador de correlação">
                Request ID: <code>{requestId}</code>
              </span>
            )}
          </div>

          <div className="trace-header-actions">
            <button
              type="button"
              className="trace-copy-btn"
              onClick={copyTraceJson}
              title="Copiar JSON do trace"
            >
              Copiar JSON
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              className="trace-close-btn"
              onClick={onClose}
              aria-label="Fechar gaveta de raciocínio"
            >
              ✕
            </button>
          </div>
        </header>

        {metrics && (
          <div className="trace-metrics-bar">
            {metrics.latencyMs !== undefined && (
              <div className="metric-chip">
                <span className="metric-label">Latência:</span>
                <span className="metric-val">{metrics.latencyMs}ms</span>
              </div>
            )}
            {metrics.totalTokens !== undefined && (
              <div className="metric-chip">
                <span className="metric-label">Tokens:</span>
                <span className="metric-val">{metrics.totalTokens}</span>
              </div>
            )}
            {metrics.modelUsed && (
              <div className="metric-chip">
                <span className="metric-label">Modelo:</span>
                <span className="metric-val">{metrics.modelUsed}</span>
              </div>
            )}
            {metrics.llmCalls !== undefined && (
              <div className="metric-chip">
                <span className="metric-label">Chamadas LLM:</span>
                <span className="metric-val">{metrics.llmCalls}</span>
              </div>
            )}
          </div>
        )}

        <div className="trace-drawer-body">
          {trace.length === 0 ? (
            <div className="trace-empty">
              <p>Nenhum evento de trace foi capturado para esta requisição.</p>
              <small>Consultas diretas ou respostas em cache podem não emitir eventos intermediários.</small>
            </div>
          ) : (
            <div className="trace-timeline">
              {trace.map((evt, idx) => {
                const nodeName = evt.node || 'agent';
                const kind = evt.kind || evt.type || 'step';
                return (
                  <div key={evt.id ?? `${evt.seq}-${idx}`} className="trace-step">
                    <div className="trace-step-marker" aria-hidden="true">
                      <span className="trace-step-num">{evt.seq ?? idx + 1}</span>
                    </div>

                    <div className="trace-step-card">
                      <div className="trace-step-header">
                        <span className={`trace-node-badge node-${nodeName}`}>
                          {nodeName.toUpperCase()}
                        </span>
                        <span className="trace-kind-badge">{kind}</span>
                        {evt.timestampMs && (
                          <span className="trace-step-time">
                            +{evt.timestampMs}ms
                          </span>
                        )}
                      </div>

                      <div className="trace-step-payload">
                        {typeof evt.payload === 'string' ? (
                          <div className="trace-text-payload">{evt.payload}</div>
                        ) : (
                          <details className="trace-details" open={idx === 0 || idx === trace.length - 1}>
                            <summary className="trace-details-summary">Ver Detalhes do Payload</summary>
                            <pre className="trace-json-code">
                              {JSON.stringify(evt.payload, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
