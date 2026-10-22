import type * as Sqlite from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';

let connection: Sqlite.DatabaseSync | undefined;
let connectionPath: string | undefined;

export function closeAccountDatabase() {
  connection?.close();
  connection = undefined;
  connectionPath = undefined;
}

/** The account DB is opened at request time, never while building Next.js. */
export function accountDatabase(): Sqlite.DatabaseSync {
  const filename = path.resolve(
    process.env.DATABASE_PATH || path.join(process.cwd(), 'data/accounts.sqlite'),
  );
  if (connection && connectionPath === filename) return connection;
  closeAccountDatabase();
  mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  // getBuiltinModule keeps older bundlers from treating node:sqlite as an npm package.
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof Sqlite;
  const db = new DatabaseSync(filename);
  try {
    chmodSync(filename, 0o600);
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
    `);
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE COLLATE NOCASE,
        username TEXT UNIQUE COLLATE NOCASE,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        CHECK(email IS NOT NULL OR username IS NOT NULL)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      INSERT OR IGNORE INTO schema_migrations VALUES (1, unixepoch() * 1000);
      COMMIT;
    `);
    // Initial credentials come only from deployment secrets. Never reset an existing admin.
    const adminName = process.env.BOOTSTRAP_ADMIN_USERNAME || 'xbf';
    const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (adminPassword && !db.prepare('SELECT id FROM users WHERE username = ?').get(adminName)) {
      const salt = randomBytes(16).toString('hex');
      const digest = scryptSync(adminPassword, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
      db.prepare(
        "INSERT OR IGNORE INTO users (id, username, role, password_hash, created_at) VALUES (?, ?, 'admin', ?, ?)",
      ).run(randomBytes(16).toString('hex'), adminName, `scrypt:${salt}:${digest}`, Date.now());
    }
    connection = db;
    connectionPath = filename;
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
