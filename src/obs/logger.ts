import type { Writable } from 'node:stream';

// ─── Tipos para Logger Estruturado JSON ────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogPayload {
  requestId?: string;
  node?: string;
  type?: string;
  kind?: string;
  route?: string;
  tokens?: number;
  durationMs?: number;
  model?: string;
  statusCode?: number;
  status?: string;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export interface LoggerOptions {
  stream?: Writable;
  now?: () => string;
}

export class StructuredLogger {
  private readonly stream: Writable | null;
  private readonly now: () => string;

  constructor(options: LoggerOptions = {}) {
    this.stream = options.stream ?? null;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private writeLine(level: LogLevel, payload: StructuredLogPayload | string): void {
    const timestamp = this.now();
    let entry: Record<string, unknown>;

    if (typeof payload === 'string') {
      entry = { timestamp, level, message: payload };
    } else {
      entry = { timestamp, level, ...payload };
    }

    // Serializar em estritamente 1 linha (NDJSON)
    const line = JSON.stringify(entry) + '\n';

    if (this.stream) {
      this.stream.write(line);
    } else {
      process.stdout.write(line);
    }
  }

  info(payload: StructuredLogPayload | string): void {
    this.writeLine('info', payload);
  }

  warn(payload: StructuredLogPayload | string): void {
    this.writeLine('warn', payload);
  }

  error(payload: StructuredLogPayload | string): void {
    this.writeLine('error', payload);
  }

  debug(payload: StructuredLogPayload | string): void {
    this.writeLine('debug', payload);
  }
}

export function createLogger(options?: LoggerOptions): StructuredLogger {
  return new StructuredLogger(options);
}

export const log = createLogger();
