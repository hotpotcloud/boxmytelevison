'use strict';
// Install production dependencies once per lockfile/Node ABI, outside versioned releases.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const appDir = path.resolve(process.argv[2]);
const release = path.resolve(process.argv[3]);
if (!release.startsWith(appDir + path.sep + 'releases' + path.sep))
  throw new Error('Unexpected release directory');
const lockText = fs.readFileSync(path.join(release, 'package-lock.json'), 'utf8');
const key = createHash('sha256').update(lockText).digest('hex');
const cache = path.join(appDir, 'dependencies', `${key}-abi${process.versions.modules}`);
const ready = path.join(cache, '.ready');
fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
if (!fs.existsSync(ready) || !fs.existsSync(path.join(cache, 'node_modules/next/package.json'))) {
  fs.copyFileSync(path.join(release, 'package.json'), path.join(cache, 'package.json'));
  const lock = JSON.parse(lockText);
  // Preserve integrity hashes while routing default-registry downloads through the domestic mirror.
  for (const entry of Object.values(lock.packages || {})) {
    if (
      typeof entry.resolved === 'string' &&
      entry.resolved.startsWith('https://registry.npmjs.org/')
    ) {
      entry.resolved = entry.resolved.replace(
        'https://registry.npmjs.org/',
        'https://registry.npmmirror.com/',
      );
    }
  }
  fs.writeFileSync(path.join(cache, 'package-lock.json'), JSON.stringify(lock));
  const npm = [
    path.join(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    '/usr/share/nodejs/npm/bin/npm-cli.js',
    '/usr/local/lib/node_modules/npm/bin/npm-cli.js',
  ].find((filename) => fs.existsSync(filename));
  if (!npm) throw new Error('The Node installation must include npm');
  console.log(
    'Installing production runtime dependencies on server; no application build is performed',
  );
  const result = spawnSync(
    process.execPath,
    [
      npm,
      'ci',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--prefer-offline',
      '--registry=https://registry.npmmirror.com',
      '--cache=' + path.join(appDir, 'npm-cache'),
    ],
    {
      cwd: cache,
      stdio: 'inherit',
      timeout: 600000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=384',
        PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH,
      },
    },
  );
  if (result.error || result.status !== 0)
    throw new Error('Production dependency installation failed');
  fs.writeFileSync(ready, `${key}\n`);
} else {
  console.log('Reusing verified production dependency cache');
}
const target = path.join(release, 'node_modules');
if (fs.existsSync(target)) throw new Error('Application package must not include node_modules');
fs.symlinkSync(
  path.join(cache, 'node_modules'),
  target,
  process.platform === 'win32' ? 'junction' : 'dir',
);
console.log('Production runtime dependencies linked into release');
