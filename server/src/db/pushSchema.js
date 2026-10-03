/**
 * Применение схемы к настроенной базе данных (Turso или локальный файл).
 *
 * Использование:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:push
 *
 * Скрипт создаёт недостающие таблицы и индексы, ничего не удаляет,
 * существующие данные не трогает. Годится и для проверки доступности
 * Turso перед деплоем.
 */
import { DB_URL, DB_IS_REMOTE } from '../config/index.js';
import { applySchema, normalizeRows } from './connection.js';
import { createDbClient } from './createDbClient.js';

async function pushSchema() {
  const target = DB_IS_REMOTE ? `удалённая база Turso (${DB_URL})` : `локальный файл (${DB_URL})`;
  console.log(`🎯 Целевая база: ${target}`);

  const client = createDbClient();

  try {
    // Проверяем, что подключение живое и токен принят
    await client.execute('SELECT 1');
    console.log('✅ Подключение установлено');

    const applied = await applySchema(client);
    console.log(`✅ Схема применена (${applied} выражений)`);

    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const tableNames = normalizeRows(tables).map((row) => row.name);
    console.log(`📋 Таблицы в базе: ${tableNames.join(', ')}`);

    console.log('🎉 Готово');
  } catch (error) {
    console.error('❌ Не удалось применить схему:', error.message);
    if (DB_IS_REMOTE) {
      console.error('   Проверьте TURSO_DATABASE_URL и TURSO_AUTH_TOKEN (создаётся командой `turso db tokens create <db>`).');
    }
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

pushSchema();