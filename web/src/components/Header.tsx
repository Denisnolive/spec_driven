import React from 'react';
import type { ThemeMode } from '../types/config';

interface HeaderProps {
  apiStatus: 'online' | 'offline' | 'checking';
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  apiStatus,
  theme,
  onToggleTheme,
  onOpenSettings,
}) => {
  return (
    <header className="app-header" role="banner">
      <div className="header-brand">
        <div className="header-logo" aria-hidden="true">
          ⚡
        </div>
        <div className="header-titles">
          <h1 className="header-title">OpsPilot War Room</h1>
          <span className="header-subtitle">Copiloto de Plantão & Operações</span>
        </div>
      </div>

      <div className="header-controls">
        <div
          className={`api-status-indicator status-${apiStatus}`}
          title={`Status da conexão com a API OpsPilot: ${apiStatus}`}
        >
          <span className="status-dot" aria-hidden="true" />
          <span className="status-label">
            {apiStatus === 'online' ? 'API Online' : apiStatus === 'checking' ? 'Conectando...' : 'API Offline'}
          </span>
        </div>

        <button
          type="button"
          className="header-btn theme-toggle-btn"
          onClick={onToggleTheme}
          aria-label={`Alternar para tema ${theme === 'dark' ? 'claro' : 'escuro'}`}
          title={`Tema atual: ${theme}`}
        >
          {theme === 'dark' ? (
            <span aria-hidden="true">☀️</span>
          ) : (
            <span aria-hidden="true">🌙</span>
          )}
        </button>

        <button
          type="button"
          className="header-btn settings-btn"
          onClick={onOpenSettings}
          aria-label="Configurações da War Room (URL da API)"
          title="Configurações da API"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
};
