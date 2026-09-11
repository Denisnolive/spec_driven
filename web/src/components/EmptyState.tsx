import React from 'react';

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

const QUICK_PROMPTS = [
  'Quais alertas estão disparando agora?',
  'Verificar status do GitHub e Cloudflare',
  'Listar incidentes abertos na produção',
  'Consultar runbook do serviço api-gateway',
];

export const EmptyState: React.FC<EmptyStateProps> = ({ onSelectPrompt }) => {
  return (
    <div className="empty-state" role="region" aria-label="Boas-vindas e ações rápidas">
      <div className="empty-state-icon" aria-hidden="true">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      </div>

      <h2 className="empty-state-title">War Room OpsPilot</h2>
      <p className="empty-state-desc">
        Seu copiloto de plantão para triagem de alertas em tempo real, mitigação de incidentes
        e execução de runbooks operacionais.
      </p>

      <div className="empty-state-prompts">
        <span className="empty-state-prompts-label">Sugestões de início rápido:</span>
        <div className="empty-state-buttons">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="quick-prompt-btn"
              onClick={() => onSelectPrompt(prompt)}
            >
              <span className="quick-prompt-arrow" aria-hidden="true">→</span>
              <span>{prompt}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
