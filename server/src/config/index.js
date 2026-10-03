import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';

// Получаем директорию текущего модуля
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем server/.env (если файл есть). Реальные переменные окружения
// имеют приоритет: dotenv не перезаписывает уже установленные значения.
dotenv.config({ path: path.join(__dirname, '../../.env'), quiet: true });

// Порт сервера
export const PORT = process.env.PORT || 3001;

// Путь к локальному файлу базы данных (используется, если Turso не настроен)
export const LOCAL_DB_PATH = path.join(__dirname, '../../salary_tracker.db');

/**
 * Подключение к базе данных.
 *
 * Два режима:
 *  1. Turso (удалённая база) — если заданы TURSO_DATABASE_URL и TURSO_AUTH_TOKEN.
 *     Пример URL: libsql://my-db-yourname.turso.io
 *  2. Локальный файл — иначе используется server/salary_tracker.db.
 *
 * Флаг DB_IS_REMOTE используется в логах и в importLocalData.js.
 */
const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();

export const DB_IS_REMOTE = Boolean(tursoUrl && tursoToken);

// URL, который понимает createClient() из @libsql/client:
// для Turso — libsql://... , для локального файла — file:///D:/... (абсолютный путь)
export const DB_URL = DB_IS_REMOTE
  ? tursoUrl
  : pathToFileURL(LOCAL_DB_PATH).href;

// Токен нужен только для удалённой базы; для file:// он не передаётся
export const DB_AUTH_TOKEN = DB_IS_REMOTE ? tursoToken : undefined;

// Секретный ключ для JWT-токенов
// В production используйте переменную окружения JWT_SECRET
export const SECRET_KEY = process.env.JWT_SECRET || 'salary-tracker-secret-key-2026-change-in-production';

// Настройки CORS
export const CORS_OPTIONS = {
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
};