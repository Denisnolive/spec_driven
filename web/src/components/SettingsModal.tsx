import React, { useState, useEffect, useRef } from 'react';
import { getApiBaseUrl, setApiBaseUrl, checkApiHealth } from '../services/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [url, setUrl] = useState('');
  const [testResult, setTestResult] = useState<{
    status: 'idle' | 'testing' | 'success' | 'error';
    message?: string;
  }>({ status: 'idle' });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl(getApiBaseUrl());
      setTestResult({ status: 'idle' });
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTestResult({ status: 'testing', message: 'Testando comunicação com a API...' });
    setApiBaseUrl(url);
    const res = await checkApiHealth();
    if (res.ok) {
      setTestResult({ status: 'success', message: 'Conexão estabelecida com sucesso!' });
    } else {
      setTestResult({
        status: 'error',
        message: `Falha ao conectar: ${res.message || 'Verifique se o backend está rodando'}`,
      });
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setApiBaseUrl(url);
    onSaved();
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-modal-header">
          <h2 id="settings-title" className="settings-modal-title">
            Configurações da War Room
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Fechar modal de configurações"
          >
            ✕
          </button>
        </header>

        <form onSubmit={handleSave} className="settings-form">
          <div className="form-group">
            <label htmlFor="api-url-input" className="form-label">
              URL Base da API OpsPilot:
            </label>
            <input
              ref={inputRef}
              id="api-url-input"
              type="url"
              className="form-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:3000"
              required
            />
            <span className="form-hint">
              Ex: <code>http://localhost:3000</code>. A URL é salva localmente no navegador (`localStorage`).
            </span>
          </div>

          {testResult.status !== 'idle' && (
            <div className={`test-result-box test-${testResult.status}`} role="status">
              {testResult.status === 'testing' && '⏳ '}
              {testResult.status === 'success' && '✔ '}
              {testResult.status === 'error' && '✕ '}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="settings-modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleTestConnection}
              disabled={testResult.status === 'testing'}
            >
              Testar Conexão
            </button>

            <div className="actions-right">
              <button
                type="button"
                className="btn-ghost"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
