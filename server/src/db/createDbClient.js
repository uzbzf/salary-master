import { createClient } from '@libsql/client';
import { DB_URL, DB_AUTH_TOKEN } from '../config/index.js';

/**
 * Создаёт клиент @libsql/client (локальный file:// или удалённый Turso).
 * @param {{ url?: string, authToken?: string|null }} [options] — переопределение URL и токена
 * @returns {import('@libsql/client').Client}
 */
export function createDbClient(options = {}) {
  const url = options.url ?? DB_URL;
  const token =
    options.authToken !== undefined ? options.authToken : DB_AUTH_TOKEN;

  return createClient({
    url,
    ...(token ? { authToken: token } : {}),
  });
}
