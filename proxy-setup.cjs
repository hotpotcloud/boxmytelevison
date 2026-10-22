'use strict';

/**
 * Node 预加载脚本（NODE_OPTIONS=--require ./proxy-setup.cjs）。
 * 在 Next.js 启动前把全局 fetch 切换到本地代理（APP_PROXY），
 * 避免 TUN 模式下到部分源站的间歇性连接超时。
 * 纯 CommonJS，不经过 webpack 打包。
 */
try {
  const proxy = process.env.APP_PROXY;
  if (proxy) {
    const { setGlobalDispatcher, ProxyAgent } = require('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
  }
} catch (e) {
  // 预加载失败不应阻断启动
  process.emitWarning('proxy-setup failed: ' + (e && e.message));
}
