import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DB_URL, DB_IS_REMOTE } from '../config/index.js';
import { createDbClient } from './createDbClient.js';

let client = null;
let adapter = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * Приводит значение к типу, который принимает libSQL в качестве параметра.
 * libSQL отклоняет undefined, NaN и Infinity, поэтому такие значения
 * превращаются в null. boolean превращается в 1/0 для единообразия
 * между локальным и удалённым драйвером.
 * @param {any} value - исходное значение
 * @returns {string|number|null} значение, безопасное для libSQL
 */
function normalizeArg(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

/**
 * Turso/libSQL иногда отдаёт INTEGER как bigint — JSON и арифметика ломаются без приведения.
 * @param {any} value
 * @returns {any}
 */
function coerceCellValue(value) {
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }
  return value;
}

/**
 * Приводит строки результата к обычным объектам с именованными полями.
 * Удалённый Turso возвращает Row-массивы (доступ по имени через Proxy),
 * локальный файл — уже готовые объекты. Здесь оба случая приводятся
 * к одному виду, чтобы сервисы работали одинаково.
 * @param {Object} result - результат client.execute()
 * @returns {Array<Object>} массив объектов
 */
export function normalizeRows(result) {
  const rows = result?.rows || [];

  const columnNames =
    Array.isArray(result?.columns) && result.columns.every((col) => col && typeof col.name === 'string')
      ? result.columns.map((col) => col.name)
      : null;

  if (columnNames) {
    return rows.map((row) => {
      const plain = {};
      columnNames.forEach((name, index) => {
        plain[name] = coerceCellValue(row[index]);
      });
      return plain;
    });
  }

  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const plain = {};
    for (const key of Object.keys(row)) {
      plain[key] = coerceCellValue(row[key]);
    }
    return plain;
  });
}

/**
 * Разбивает SQL-файл на отдельные выражения, игнорируя строковые литералы
 * с точкой с запятой и комментарии --.
 * @param {string} sql - содержимое .sql файла
 * @returns {Array<string>} массив выражений
 */
export function splitStatements(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/**
 * Применяет схему из schema.sql к подключённой базе
 * @param {Object} db - экземпляр @libsql/client
 * @returns {Promise<number>} количество выполненных выражений
 */
export async function applySchema(db) {
  const statements = splitStatements(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
  await db.batch(statements, 'write');
  return statements.length;
}

/**
 * Инициализация подключения к базе данных (Turso или локальный файл)
 * и применение схемы. Все выражения в schema.sql идемпотентны.
 */
export async function initDb() {
  client = createDbClient();

  // Включаем внешние ключи (ON DELETE CASCADE). Удалённый Turso может
  // отклонить pragma, поэтому ошибку не считаем критичной.
  try {
    await client.execute('PRAGMA foreign_keys = ON;');
  } catch {
    console.warn('⚠️  PRAGMA foreign_keys недоступен для этого подключения');
  }

  const applied = await applySchema(client);

  adapter = {
    /**
     * Выполнить запрос и вернуть первую строку (или undefined)
     */
    async get(sql, params = []) {
      const result = await client.execute({ sql, args: params.map(normalizeArg) });
      return normalizeRows(result)[0];
    },

    /**
     * Выполнить запрос и вернуть все строки
     */
    async all(sql, params = []) {
      const result = await client.execute({ sql, args: params.map(normalizeArg) });
      return normalizeRows(result);
    },

    /**
     * Выполнить INSERT/UPDATE/DELETE
     * @returns {Promise<{changes: number, lastInsertRowid: bigint|null}>}
     */
    async run(sql, params = []) {
      const result = await client.execute({ sql, args: params.map(normalizeArg) });
      return {
        changes: Number(result.rowsAffected ?? 0),
        lastInsertRowid: result.lastInsertRowid ?? null,
      };
    },

    /**
     * Выполнить несколько выражений подряд (как exec в пакете sqlite)
     */
    async exec(sql) {
      return client.executeMultiple(sql);
    },

    /**
     * Выполнить транзакцию. mode: 'read' | 'write'
     * @param {string} mode - режим транзакции
     * @param {(tx: Object) => Promise<any>} callback - тело транзакции
     */
    async transaction(mode, callback) {
      const tx = await client.transaction(mode);
      try {
        const result = await callback({
          get: async (sql, params = []) =>
            normalizeRows(await tx.execute({ sql, args: params.map(normalizeArg) }))[0],
          all: async (sql, params = []) =>
            normalizeRows(await tx.execute({ sql, args: params.map(normalizeArg) })),
          run: async (sql, params = []) => {
            const res = await tx.execute({ sql, args: params.map(normalizeArg) });
            return { changes: Number(res.rowsAffected ?? 0) };
          },
        });
        await tx.commit();
        return result;
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    },

    /**
     * Закрыть подключение
     */
    async close() {
      if (client) {
        await client.close();
        client = null;
        adapter = null;
      }
    },
  };

  const target = DB_IS_REMOTE ? `Turso (${DB_URL})` : `файл ${DB_URL}`;
  console.log(`✅ База данных инициализирована: ${target}`);
  console.log(`✅ Схема применена (${applied} выражений)`);
}

/**
 * Получить экземпляр базы данных с методом get/all/run/exec
 * @returns {Object} адаптер поверх @libsql/client
 */
export function getDb() {
  if (!adapter) {
    throw new Error('База данных ещё не инициализирована. Вызовите initDb() перед использованием.');
  }
  return adapter;
}

/**
 * Получить «сырой» клиент @libsql/client (нужен для batch и служебных скриптов)
 * @returns {Object} клиент @libsql/client
 */
export function getClient() {
  if (!client) {
    throw new Error('База данных ещё не инициализирована. Вызовите initDb() перед использованием.');
  }
  return client;
}

/**
 * Закрыть подключение к базе данных
 */
export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    adapter = null;
  }
}