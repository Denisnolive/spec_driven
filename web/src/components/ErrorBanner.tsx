import React from 'react';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  onRetry,
  onDismiss,
}) => {
  return (
    <div className="error-banner" role="alert">
      <div className="error-banner-content">
        <span className="error-banner-icon" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </span>
        <div className="error-banner-text">
          <strong>Falha de comunicação:</strong> {message}
        </div>
      </div>

      <div className="error-banner-actions">
        {onRetry && (
          <button
            type="button"
            className="error-retry-btn"
            onClick={onRetry}
          >
            Tentar novamente
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            className="error-dismiss-btn"
            onClick={onDismiss}
            aria-label="Dispensar aviso de erro"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};
