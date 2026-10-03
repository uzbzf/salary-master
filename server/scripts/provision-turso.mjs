/**
 * Полная настройка Turso: создать базу, выпустить JWT, записать server/.env,
 * применить схему и перенести данные из salary_tracker.db.
 *
 * Нужны переменные (в окружении или в server/.env):
 *   TURSO_ORG              — slug организации (turso org list)
 *   TURSO_PLATFORM_TOKEN   — API-токен платформы (turso auth api-tokens mint)
 *
 * Опционально:
 *   TURSO_DB_NAME          — имя базы (по умолчанию salary-tracker)
 *
 * Запуск: npm run turso:provision
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient as createTursoApi } from '@tursodatabase/api';
import dotenv from 'dotenv';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(SERVER_ROOT, '.env');

dotenv.config({ path: ENV_PATH, quiet: true });

const DB_NAME = (process.env.TURSO_DB_NAME || 'salary-tracker').trim();
const ORG = process.env.TURSO_ORG?.trim();
const PLATFORM_TOKEN = process.env.TURSO_PLATFORM_TOKEN?.trim();

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function upsertEnv(lines) {
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  const map = new Map();

  for (const line of existing.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) {
      continue;
    }
    const idx = line.indexOf('=');
    map.set(line.slice(0, idx).trim(), line.slice(idx + 1));
  }

  for (const [key, value] of Object.entries(lines)) {
    map.set(key, value);
  }

  const defaults = {
    PORT: map.get('PORT') || '3001',
    CLIENT_URL: map.get('CLIENT_URL') || 'http://localhost:5173',
    JWT_SECRET: map.get('JWT_SECRET') || crypto.randomBytes(48).toString('hex'),
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!map.has(key) || !map.get(key)) {
      map.set(key, value);
    }
  }

  const body = [
    '# Сгенерировано scripts/provision-turso.mjs — не коммитьте в Git',
    `TURSO_DATABASE_URL=${map.get('TURSO_DATABASE_URL')}`,
    `TURSO_AUTH_TOKEN=${map.get('TURSO_AUTH_TOKEN')}`,
    `TURSO_ORG=${map.get('TURSO_ORG') || ORG}`,
    `TURSO_PLATFORM_TOKEN=${map.get('TURSO_PLATFORM_TOKEN') || PLATFORM_TOKEN}`,
    `TURSO_DB_NAME=${DB_NAME}`,
    `PORT=${map.get('PORT')}`,
    `JWT_SECRET=${map.get('JWT_SECRET')}`,
    `CLIENT_URL=${map.get('CLIENT_URL')}`,
    '',
  ].join('\n');

  fs.writeFileSync(ENV_PATH, body, 'utf-8');
  console.log(`✅ Записан ${ENV_PATH}`);
}

function runNpmScript(script) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['run', script], {
    cwd: SERVER_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...dotenv.parse(fs.readFileSync(ENV_PATH)) },
  });
  if (result.status !== 0) {
    fail(`Команда npm run ${script} завершилась с кодом ${result.status}`);
    return false;
  }
  return true;
}

async function main() {
  if (!ORG || !PLATFORM_TOKEN) {
    fail(
      'Задайте TURSO_ORG и TURSO_PLATFORM_TOKEN.\n' +
        '   Получить: turso auth login && turso auth api-tokens mint platform\n' +
        '   Организация: turso org list',
    );
    return;
  }

  const api = createTursoApi({ org: ORG, token: PLATFORM_TOKEN });

  let db;
  try {
    db = await api.databases.get(DB_NAME);
    console.log(`ℹ️  База «${DB_NAME}» уже существует (${db.hostname})`);
  } catch (error) {
    if (error?.status !== 404 && !String(error?.message || '').includes('404')) {
      throw error;
    }
    console.log(`📦 Создаём базу «${DB_NAME}»…`);
    db = await api.databases.create(DB_NAME, { group: 'default' });
    console.log(`✅ База создана: ${db.hostname}`);
  }

  const url = `libsql://${db.hostname}`;
  console.log(`🔗 URL: ${url}`);

  const { jwt } = await api.databases.createToken(DB_NAME, {
    authorization: 'full-access',
    expiration: 'never',
  });

  upsertEnv({
    TURSO_DATABASE_URL: url,
    TURSO_AUTH_TOKEN: jwt,
    TURSO_ORG: ORG,
    TURSO_PLATFORM_TOKEN: PLATFORM_TOKEN,
  });

  if (!runNpmScript('db:push')) return;
  runNpmScript('db:import');

  console.log('🎉 Turso готов. Запуск API: npm start');
}

main().catch((error) => {
  console.error('❌', error.message || error);
  process.exitCode = 1;
});
