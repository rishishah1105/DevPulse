import pool from './pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const files = fs.readdirSync(path.join(__dirname, 'migrations'))
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8');
  await pool.query(sql);
  console.log(`ran: ${file}`);
}

await pool.end();
console.log('migrations complete');
