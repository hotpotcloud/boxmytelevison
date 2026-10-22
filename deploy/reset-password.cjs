'use strict';
// Server-only recovery tool. No password argument, network endpoint or third-party service.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, scryptSync } = require('node:crypto');

function resetAccountPassword({ databasePath, identifier, password }) {
  if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 254)
    throw new Error('请指定账号名或注册邮箱');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128)
    throw new Error('新密码长度需为 8–128 个字符');
  const filename = path.resolve(databasePath);
  if (!fs.existsSync(filename) || !fs.statSync(filename).isFile())
    throw new Error('数据库不存在，请检查路径；工具不会创建新数据库');
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const row = db
      .prepare(
        'SELECT id, password_hash FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE',
      )
      .all(identifier.trim(), identifier.trim());
    if (row.length !== 1)
      throw new Error(row.length ? '账号匹配不唯一，请联系维护者' : '账号不存在，未修改任何数据');
    const salt = randomBytes(16).toString('hex');
    const digest = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      const changed = db
        .prepare('UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?')
        .run(`scrypt:${salt}:${digest}`, row[0].id, row[0].password_hash);
      if (Number(changed.changes) !== 1) throw new Error('账号刚刚发生变化，请重新运行');
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row[0].id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
}
async function main() {
  const { parseArgs } = require('node:util');
  const { values, positionals } = parseArgs({
    options: { database: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(
      '用法：node reset-password.cjs <账号名或邮箱> [--database /path/accounts.sqlite]\n新密码在终端隐藏输入两次，不支持密码参数或管道。',
    );
    return;
  }
  if (positionals.length !== 1) throw new Error('请指定一个账号名或邮箱；运行 --help 查看用法');
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('请在交互式 SSH 终端运行，不支持管道输入密码');
  const { Writable } = require('node:stream');
  const { createInterface } = require('node:readline/promises');
  const hiddenOutput = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output: hiddenOutput,
    terminal: true,
    historySize: 0,
  });
  const abort = new AbortController();
  rl.on('SIGINT', () => abort.abort());
  try {
    console.log('重置指定账号的密码，将撤销该账号所有已登录会话。按 Ctrl+C 取消。');
    process.stdout.write('新密码（8–128 字符，输入不回显）：');
    const password = await rl.question('', { signal: abort.signal });
    process.stdout.write('\n再次输入新密码：');
    const confirmation = await rl.question('', { signal: abort.signal });
    process.stdout.write('\n');
    if (password !== confirmation) throw new Error('两次密码不一致，未修改任何数据');
    resetAccountPassword({
      databasePath:
        values.database || process.env.DATABASE_PATH || '/opt/boxmytelevison/data/accounts.sqlite',
      identifier: positionals[0],
      password,
    });
    console.log('密码已重置，该账号所有设备已退出。无需重启服务，请使用新密码登录。');
  } finally {
    rl.close();
    hiddenOutput.end();
  }
}
module.exports = { resetAccountPassword };
if (require.main === module)
  main().catch((error) => {
    console.error(error.name === 'AbortError' ? '\n已取消，未修改密码' : error.message);
    process.exitCode = 1;
  });
