import React, { useState } from 'react';
import type { ApprovalAction } from '../types/chat';

interface ApprovalCardProps {
  approval: ApprovalAction;
  onApprove: (action: ApprovalAction) => Promise<void> | void;
  onReject: (action: ApprovalAction) => Promise<void> | void;
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  approval,
  onApprove,
  onReject,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await onApprove(approval);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await onReject(approval);
    } finally {
      setIsProcessing(false);
    }
  };

  const isResolved = approval.decision !== 'pending';

  return (
    <div
      className={`approval-card severity-${approval.severity} ${
        isResolved ? `status-${approval.decision}` : 'status-pending'
      }`}
      role="region"
      aria-label="Autorização de Ação Operacional Crítica"
    >
      <div className="approval-card-header">
        <div className="approval-badge-group">
          <span className="approval-badge-indicator" aria-hidden="true" />
          <span className="approval-badge-title">Ação Requer Aprovação (HTTP 202)</span>
        </div>
        <span className={`severity-pill severity-${approval.severity}`}>
          {approval.severity.toUpperCase()}
        </span>
      </div>

      <div className="approval-card-body">
        <h3 className="approval-action-title">
          {approval.actionName} — Serviço: <code>{approval.service}</code>
        </h3>
        <p className="approval-action-summary">{approval.summary}</p>

        {approval.params && Object.keys(approval.params).length > 0 && (
          <div className="approval-params-block">
            <span className="approval-params-label">Parâmetros:</span>
            <pre className="approval-params-code">
              {JSON.stringify(approval.params, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="approval-card-footer">
        {approval.decision === 'pending' ? (
          <div className="approval-buttons">
            <button
              type="button"
              className="btn-approve"
              onClick={handleApprove}
              disabled={isProcessing}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{isProcessing ? 'Processando...' : 'Aprovar Ação'}</span>
            </button>

            <button
              type="button"
              className="btn-reject"
              onClick={handleReject}
              disabled={isProcessing}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>{isProcessing ? 'Processando...' : 'Negar Ação'}</span>
            </button>
          </div>
        ) : (
          <div className={`approval-resolution-badge resolution-${approval.decision}`}>
            {approval.decision === 'approved' ? (
              <>
                <span aria-hidden="true">✔</span>
                <span>Aprovado pelo operador humano</span>
              </>
            ) : (
              <>
                <span aria-hidden="true">✕</span>
                <span>Ação rejeitada pelo operador humano</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
