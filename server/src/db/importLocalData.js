/**
 * Перенос данных из локального файла server/salary_tracker.db
 * в настроенную базу (Turso или локальный файл).
 *
 * Использование:
 *   1) сначала  TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:push
 *   2) затем    TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:import
 *
 * Скрипт идемпотентен: строка уже существующая (по id) пропускается,
 * поэтому его можно запускать повторно. Данные читаются только из локального
 * файла — ничего не удаляется.
 */
import fs from 'fs';
import { pathToFileURL } from 'url';
import { DB_URL, DB_IS_REMOTE, LOCAL_DB_PATH } from '../config/index.js';
import { applySchema, normalizeRows } from './connection.js';
import { createDbClient } from './createDbClient.js';

// Порядок важен: сначала пользователи, потом операции (внешние ключи)
const TABLES = [
  {
    name: 'users',
    columns: ['id', 'email', 'name', 'password_hash', 'created_at', 'updated_at'],
  },
  {
    name: 'incomes',
    columns: ['id', 'user_id', 'amount', 'date', 'category', 'comment', 'created_at', 'updated_at'],
  },
  {
    name: 'expenses',
    columns: [
      'id',
      'user_id',
      'amount',
      'date',
      'category',
      'comment',
      'is_recurring',
      'created_at',
      'updated_at',
    ],
  },
];

async function importLocalData() {
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    console.error(`❌ Локальный файл не найден: ${LOCAL_DB_PATH}`);
    process.exitCode = 1;
    return;
  }

  const target = DB_IS_REMOTE ? `удалённая база Turso (${DB_URL})` : `локальный файл (${DB_URL})`;
  console.log(`📥 Источник: ${LOCAL_DB_PATH}`);
  console.log(`🎯 Приёмник: ${target}`);

  if (!DB_IS_REMOTE) {
    console.warn('⚠️  TURSO_DATABASE_URL/TURSO_AUTH_TOKEN не заданы — перенос будет локальным (no-op).');
  }

  const source = createDbClient({ url: pathToFileURL(LOCAL_DB_PATH).href, authToken: null });
  const targetClient = createDbClient();

  try {
    const applied = await applySchema(targetClient);
    console.log(`✅ Схема в приёмнике готова (${applied} выражений)`);

    for (const table of TABLES) {
      const sourceResult = await source.execute(`SELECT * FROM ${table.name}`);
      const sourceRows = normalizeRows(sourceResult);
      if (sourceRows.length === 0) {
        console.log(`   ${table.name}: в источнике нет строк — пропускаем`);
        continue;
      }

      const existing = await targetClient.execute(`SELECT id FROM ${table.name}`);
      const existingIds = new Set(normalizeRows(existing).map((row) => row.id));

      const missing = sourceRows.filter((row) => !existingIds.has(row.id));

      if (missing.length === 0) {
        console.log(`   ${table.name}: все ${sourceRows.length} строк уже на месте — пропускаем`);
        continue;
      }

      const placeholders = table.columns.map(() => '?').join(', ');
      const statements = missing.map((row) => ({
        sql: `INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES (${placeholders})`,
        args: table.columns.map((column) => row[column] ?? null),
      }));

      // Один batch — одна транзакция на стороне Turso
      await targetClient.batch(statements, 'write');
      console.log(`   ${table.name}: перенесено ${missing.length} из ${sourceRows.length}`);
    }

    console.log('🎉 Перенос данных завершён');
  } catch (error) {
    console.error('❌ Ошибка переноса данных:', error.message);
    process.exitCode = 1;
  } finally {
    await source.close();
    await targetClient.close();
  }
}

importLocalData();