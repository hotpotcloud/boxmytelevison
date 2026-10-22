'use strict';
// Probe from the deployed application's network, not from the developer's machine.
const fs = require('node:fs');
const { parseArgs } = require('node:util');
const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://119.29.189.103:8080' },
    input: { type: 'string' },
    output: { type: 'string', default: 'vod-source-results.json' },
  },
});
if (!values.input)
  throw new Error(
    'Usage: node scripts/check-vod-sources.cjs --input candidates.json --output results.json [--base URL]',
  );
const base = new URL(values.base).origin;
const candidates = JSON.parse(fs.readFileSync(values.input, 'utf8').replace(/^\uFEFF/, ''));
if (!Array.isArray(candidates) || candidates.length > 30)
  throw new Error('Expected at most 30 candidates');
const report = {
  checkedAt: new Date().toISOString(),
  server: base,
  concurrency: 2,
  sampleBytesLimit: 65536,
  results: [],
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}
async function sample(url, limit = 65536) {
  // All upstream requests pass through the application's existing SSRF checks.
  const response = await fetch(url, {
    headers: { Range: 'bytes=0-' + (limit - 1) },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  if (!response.body) throw new Error('Empty response');
  const reader = response.body.getReader(),
    chunks = [];
  let count = 0;
  try {
    while (count < limit) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, limit - count);
      chunks.push(chunk);
      count += chunk.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return {
    status: response.status,
    data: Buffer.concat(chunks),
    contentType: response.headers.get('content-type') || '',
  };
}
async function mediaProbe(url) {
  let target = base + '/api/proxy?url=' + encodeURIComponent(url),
    hops = 0;
  for (; hops < 4; hops++) {
    const response = await sample(target, 131072),
      text = response.data
        .toString('utf8')
        .replace(/^\uFEFF/, '')
        .trim();
    if (!text.startsWith('#EXTM3U')) throw new Error('播放地址未返回 HLS 清单');
    const lines = text.split(/\r?\n/).map((s) => s.trim()),
      uris = lines.filter((s) => s && !s.startsWith('#'));
    if (!uris.length) throw new Error('HLS 清单没有媒体地址');
    const next = new URL(uris[0], target).href;
    if (new URL(next).origin !== base) throw new Error('播放清单未经过本站代理重写');
    if (lines.some((s) => s.startsWith('#EXT-X-STREAM-INF'))) {
      target = next;
      continue;
    }
    const encryption = lines.find((s) => s.startsWith('#EXT-X-KEY:') && !s.includes('METHOD=NONE'));
    if (encryption) {
      const key = /URI="([^"]+)"/.exec(encryption)?.[1];
      if (!key) throw new Error('无法读取加密密钥地址');
      const keyUrl = new URL(key, target);
      if (keyUrl.origin !== base) throw new Error('密钥地址未代理');
      const keyData = await sample(keyUrl.href, 32);
      if (keyData.data.length !== 16) throw new Error('AES 密钥长度无效');
    }
    const fragment = await sample(next),
      prefix = fragment.data.subarray(0, 100).toString('utf8').trim();
    if (fragment.data.length < 1024 || /^<!doctype|^<html|^\{|AccessDenied|Forbidden/i.test(prefix))
      throw new Error('视频分片为空或返回错误页');
    return {
      manifestStatus: response.status,
      fragmentStatus: fragment.status,
      fragmentBytes: fragment.data.length,
      manifestHops: hops + 1,
      mediaHost: new URL(url).hostname,
    };
  }
  throw new Error('HLS 清单嵌套过深');
}
async function probe(candidate, index) {
  const start = Date.now(),
    result = {
      name: candidate.name,
      url: candidate.url,
      reference: candidate.reference,
      passed: false,
      stage: 'search',
    };
  const source = { key: 'audit_' + index, name: candidate.name, url: candidate.url };
  try {
    let item;
    for (const keyword of ['流浪地球', '希望', '斗罗大陆', '爱情']) {
      const searched = await jsonRequest(base + '/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wd: keyword, sources: [source], filterAdult: true }),
      });
      if (searched.failures?.length) throw new Error(searched.failures[0].error || '搜索源失败');
      item = searched.list?.find((v) => v.name === keyword) || searched.list?.[0];
      if (item) {
        result.keyword = keyword;
        result.searchCount = searched.list.length;
        break;
      }
      await pause(500);
    }
    if (!item) throw new Error('多组常见关键词未返回影片');
    result.stage = 'detail';
    result.vodId = item.vodId;
    result.title = item.name;
    const detail = await jsonRequest(
      base +
        '/api/detail?' +
        new URLSearchParams({ id: item.vodId, source: JSON.stringify(source) }),
    );
    if (!detail.episodes?.length) throw new Error('详情未返回剧集或播放地址');
    result.episodes = detail.episodes.length;
    result.stage = 'media';
    Object.assign(result, await mediaProbe(detail.episodes[0]));
    result.passed = true;
    result.stage = 'complete';
  } catch (error) {
    result.error = error.message;
  } finally {
    result.elapsedMs = Date.now() - start;
    report.results[index] = result;
    fs.writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(result));
  }
}
(async () => {
  let index = 0;
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      for (;;) {
        const i = index++;
        if (i >= candidates.length) return;
        await probe(candidates[i], i);
      }
    }),
  );
  console.log(
    JSON.stringify({
      tested: report.results.length,
      passed: report.results.filter((r) => r.passed).length,
      report: values.output,
    }),
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
