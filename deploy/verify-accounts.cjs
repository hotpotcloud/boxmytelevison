'use strict';
// Deployment-only integration check: create a uniquely named temporary user, then remove it.
const { randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const base = 'http://127.0.0.1:8080';
const email = `deployment-check-${randomBytes(12).toString('hex')}@invalid.example`;
const password = randomBytes(24).toString('hex');
let userId;
async function request(endpoint, options = {}) {
  return fetch(base + endpoint, { ...options, signal: AbortSignal.timeout(10000) });
}
(async () => {
  try {
    const status = await request('/api/status');
    if (!status.ok) throw new Error('Account status is unavailable');
    if ((await status.json()).registrationMode === 'closed') {
      console.log('Account registration check skipped: registration is explicitly closed');
      return;
    }
    const registration = await request('/api/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, remember: true }),
    });
    if (registration.status !== 201)
      throw new Error('Temporary account registration failed: ' + registration.status);
    const data = await registration.json();
    userId = data.user.id;
    const cookieHeader = registration.headers
      .getSetCookie()
      .find((value) => /^ltv_account=[a-f0-9]{64}/.test(value));
    if (!cookieHeader || !cookieHeader.includes('HttpOnly') || !cookieHeader.includes('Max-Age='))
      throw new Error('Persistent session cookie is missing');
    const cookie = cookieHeader.split(';')[0];
    const me = await request('/api/account/me', { headers: { cookie } });
    if (!me.ok || (await me.json()).user.id !== userId)
      throw new Error('Account session lookup failed');
    const sources = await request('/api/account/sources', { headers: { cookie } });
    if (!sources.ok) throw new Error('Account sources lookup failed');
    const profile = await sources.json();
    profile.config.customAPIs = [
      { key: 'deploy_check', name: 'Deployment check', url: 'https://example.com/api' },
    ];
    const saveSources = await request('/api/account/sources', {
      method: 'PUT',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: profile.config, revision: profile.revision }),
    });
    if (!saveSources.ok) throw new Error('Account sources persistence failed');
    const restored = await (await request('/api/account/sources', { headers: { cookie } })).json();
    if (restored.config.customAPIs[0]?.key !== 'deploy_check')
      throw new Error('Account sources restore failed');
    const staleWrite = await request('/api/account/sources', {
      method: 'PUT',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: profile.config, revision: profile.revision }),
    });
    if (staleWrite.status !== 409) throw new Error('Account source conflict was not detected');
    if ((await request('/api/account/sources')).status !== 401)
      throw new Error('Anonymous account sources accepted');
    const logout = await request('/api/auth', { method: 'DELETE', headers: { cookie } });
    if (!logout.ok) throw new Error('Session logout failed');
    const replay = await request('/api/account/me', { headers: { cookie } });
    if (replay.status !== 401) throw new Error('Logged-out session was accepted');
    console.log(
      'Account integration check passed: registration, persistent cookie, session lookup, source persistence, conflict detection, logout and replay rejection',
    );
  } finally {
    const db = new DatabaseSync(process.env.DATABASE_PATH);
    try {
      db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
      // Match both the generated email and role even if registration succeeded but its response was interrupted.
      db.prepare("DELETE FROM users WHERE email = ? AND role = 'user'").run(email);
      console.log('Temporary deployment-check account removed');
    } finally {
      db.close();
    }
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
