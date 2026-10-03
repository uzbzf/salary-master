# База данных Turso (libSQL)

Backend использует [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts): без переменных Turso работает с локальным файлом `server/salary_tracker.db`, с переменными — с облачной базой.

## 1. Установка CLI

```bash
npm install -g @tursodatabase/cli
turso auth login
```

## 2. Создание базы

```bash
turso db create salary-tracker
turso db show salary-tracker
```

Сохраните **URL** вида `libsql://salary-tracker-<login>.turso.io`.

Токен доступа (только для сервера, не коммитить):

```bash
turso db tokens create salary-tracker
```

## 3. Переменные окружения

Скопируйте шаблон и заполните значения:

```bash
cd server
copy .env.example .env
```

В `server/.env`:

```env
TURSO_DATABASE_URL=libsql://salary-tracker-yourlogin.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOi...
JWT_SECRET=<случайная строка для production>
CLIENT_URL=https://ваш-фронтенд.example
PORT=3001
```

Если **обе** переменные `TURSO_*` заданы — сервер подключается к Turso. Иначе — к `salary_tracker.db`.

## 4. Применение схемы

Схема лежит в `src/db/schema.sql` (таблицы `users`, `incomes`, `expenses` и индексы). Выражения идемпотентны (`IF NOT EXISTS`).

```bash
cd server
npm run db:push
```

Тот же файл применяется автоматически при `npm start` / `npm run dev`.

## 5. Перенос данных с локального SQLite (опционально)

Если в `salary_tracker.db` уже есть пользователи и операции:

```bash
npm run db:push
npm run db:import
```

Скрипт `db:import` читает только локальный файл, в Turso добавляет строки с новыми `id`, существующие не перезаписывает.

## 6. Запуск API

```bash
npm start
```

Проверка: `GET http://localhost:3001/health`

## 7. Деплой backend

На хостинге (Railway, Render, Fly.io и т.д.) задайте те же переменные:

| Переменная | Назначение |
|------------|------------|
| `TURSO_DATABASE_URL` | URL базы Turso |
| `TURSO_AUTH_TOKEN` | Токен API |
| `JWT_SECRET` | Секрет JWT (обязательно свой в production) |
| `CLIENT_URL` | Origin фронтенда для CORS |
| `PORT` | Порт (часто задаёт платформа) |

Файл `salary_tracker.db` на сервере **не нужен**, если используется Turso.

## Файлы в репозитории

| Файл | Роль |
|------|------|
| `src/config/index.js` | Читает `TURSO_*`, выбирает URL |
| `src/db/createDbClient.js` | Фабрика клиента libSQL |
| `src/db/connection.js` | Адаптер `get/all/run` для сервисов |
| `src/db/schema.sql` | Единственный источник схемы |
| `src/db/pushSchema.js` | `npm run db:push` |
| `src/db/importLocalData.js` | `npm run db:import` |
| `.env.example` | Шаблон переменных |

## Полезные команды Turso

```bash
turso db shell salary-tracker
turso db inspect salary-tracker
turso db tokens invalidate salary-tracker <token-id>
```
