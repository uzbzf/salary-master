import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const relPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../rel-1791025289372.db');
const client = createClient({ url: pathToFileURL(relPath).href });
try {
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  console.log('tables', tables.rows);
} finally {
  await client.close();
}
