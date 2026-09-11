export type ThemeMode = 'dark' | 'light' | 'system';

export interface AppConfig {
  apiBaseUrl: string;
  theme: ThemeMode;
}

export const DEFAULT_API_BASE_URL = 'http://localhost:3000';
export const STORAGE_KEY_API_URL = 'opspilot_api_url';
export const STORAGE_KEY_THEME = 'opspilot_theme';
