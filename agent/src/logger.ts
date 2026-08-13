/**
 * Minimal structured logger.
 *
 * Deliberately dependency-free — a risk guardian's log is part of its
 * trust story, and a logging library is not worth an extra supply-chain
 * surface for what amounts to twenty lines of code.
 *
 * BigInt is serialized explicitly because JSON.stringify throws on it, and
 * position IDs are bigints. A logger that crashes the process during an
 * emergency would be worse than no logger at all.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

function serialize(meta: Record<string, unknown>): string {
  return JSON.stringify(meta, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

export function createLogger(minLevel: LogLevel = 'info'): Logger {
  const threshold = LEVEL_ORDER[minLevel];

  const log = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < threshold) return;

    const timestamp = new Date().toISOString();
    const suffix = meta && Object.keys(meta).length > 0 ? ` ${serialize(meta)}` : '';
    const line = `${timestamp} [${level.toUpperCase()}] ${msg}${suffix}`;

    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };

  return {
    debug: (m, meta) => log('debug', m, meta),
    info: (m, meta) => log('info', m, meta),
    warn: (m, meta) => log('warn', m, meta),
    error: (m, meta) => log('error', m, meta),
  };
}
