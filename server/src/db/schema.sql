-- Актуальная схема базы данных Salary Tracker.
-- Это единственный источник правды: файл применяется автоматически при старте
-- сервера (db/connection.js → initDb) и вручную скриптом `npm run db:push`.
-- Все выражения идемпотентны (IF NOT EXISTS), поэтому файл можно применять
-- и к пустой базе Turso, и к уже существующей локальной.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incomes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  amount     REAL NOT NULL,
  date       TEXT NOT NULL,
  category   TEXT NOT NULL,
  comment    TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  amount        REAL NOT NULL,
  date          TEXT NOT NULL,
  category      TEXT NOT NULL,
  comment       TEXT,
  is_recurring  INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Индексы на user_id обязательны: все запросы сервисов фильтруют по user_id
CREATE INDEX IF NOT EXISTS idx_incomes_user_id ON incomes(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);

-- Индексы под фильтры History (дата, категория) и группировку аналитики
CREATE INDEX IF NOT EXISTS idx_incomes_date ON incomes(date);
CREATE INDEX IF NOT EXISTS idx_incomes_category ON incomes(category);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);