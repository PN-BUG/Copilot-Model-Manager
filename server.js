#!/usr/bin/env node
/**
 * Copilot Custom Endpoint Model Manager - Backend
 * 为 chatLanguageModels.json 提供 GUI 管理界面
 * 
 * 用法: node server.js [port]
 * 默认端口: 3456
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
let initSqlJs;
try { initSqlJs = require('sql.js'); } catch {
  console.warn('\x1b[33m[!] sql.js 未安装，CC Switch 导入功能不可用。请运行: npm install\x1b[0m');
}

// === pkg 打包检测 ===
const IS_PACKAGED = typeof process.pkg !== 'undefined';
// 可写文件目录：pkg 模式下放在 exe 旁边，普通模式下放在脚本旁边
const BASE_DIR = IS_PACKAGED ? path.dirname(process.execPath) : __dirname;

// === 依赖检查 ===
if (!IS_PACKAGED && !fs.existsSync(path.join(__dirname, 'node_modules'))) {
  console.warn('\x1b[33m[!] node_modules 未找到，请先运行: npm install\x1b[0m');
}

let PORT = parseInt(process.argv[2]) || 3456;

// === 日志系统 ===
const LOG_DIR = path.join(BASE_DIR, 'logs');
const LOG_PATH = path.join(LOG_DIR, 'server.log');
const LOG_MAX_SIZE = 5 * 1024 * 1024; // 5MB

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 日志级别
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLogLevel = LOG_LEVELS.info;

// 格式化时间
function formatTime() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// 写入日志文件
function writeLog(level, ...args) {
  if (LOG_LEVELS[level] < currentLogLevel) return;
  
  const timestamp = formatTime();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const line = `${prefix} ${message}\n`;
  
  // 控制台输出
  const colors = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
  console.log(`${colors[level] || ''}${line}\x1b[0m`);
  
  // 文件输出
  try {
    // 检查日志文件大小，超过限制则轮转
    if (fs.existsSync(LOG_PATH)) {
      const stats = fs.statSync(LOG_PATH);
      if (stats.size > LOG_MAX_SIZE) {
        const backupPath = LOG_PATH + '.1';
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
        fs.renameSync(LOG_PATH, backupPath);
      }
    }
    fs.appendFileSync(LOG_PATH, line, 'utf8');
  } catch (e) {
    console.error('写入日志失败:', e.message);
  }
}

// 日志工具
const log = {
  debug: (...args) => writeLog('debug', ...args),
  info: (...args) => writeLog('info', ...args),
  warn: (...args) => writeLog('warn', ...args),
  error: (...args) => writeLog('error', ...args),
};

// chatLanguageModels.json 路径（与 Copilot 共用）
const CONFIG_PATH = path.join(
  process.env.APPDATA || path.join(process.env.HOME, '.config'),
  'Code', 'User', 'chatLanguageModels.json'
);

// 本地存储的 API Keys（独立于 chatLanguageModels.json）
const KEYS_PATH = path.join(BASE_DIR, '.api-keys.json');

// URL 历史记录
const URL_HISTORY_PATH = path.join(BASE_DIR, '.url-history.json');

// CC Switch 数据库路径
const CCSWITCH_DB_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME,
  '.cc-switch', 'cc-switch.db'
);

// 用量限额数据存储
const QUOTA_PATH = path.join(BASE_DIR, '.quota-data.json');

// 环境变量映射（可选，优先级低于 .api-keys.json）
const ENV_KEY_MAP = {
  '火山引擎 Coding Plan': 'VOLCENGINE_API_KEY',
  'OpenCode Go': 'OPENCODE_API_KEY',
  'xiaomi': 'XIAOMI_API_KEY',
  'DeepSeek': 'DEEPSEEK_API_KEY',
};

log.info('服务启动中...');
log.info('配置路径:', CONFIG_PATH);
log.info('API Keys 路径:', KEYS_PATH);
log.info('CC Switch 路径:', CCSWITCH_DB_PATH);

function readJSON(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    log.debug('读取文件:', filePath);
    return data;
  } catch (e) {
    log.debug('读取文件失败:', filePath, e.message);
    return null;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, '\t'), 'utf8');
    log.debug('写入文件:', filePath);
  } catch (e) {
    log.error('写入文件失败:', filePath, e.message);
    throw e;
  }
}

function readKeys() {
  // 优先读取本地文件
  const fileKeys = readJSON(KEYS_PATH) || {};
  
  // 回退到环境变量
  const envKeys = {};
  for (const [providerName, envVar] of Object.entries(ENV_KEY_MAP)) {
    if (!fileKeys[providerName] && process.env[envVar]) {
      envKeys[providerName] = process.env[envVar];
    }
  }
  
  return { ...envKeys, ...fileKeys };
}

function writeKeys(keys) {
  writeJSON(KEYS_PATH, keys);
}

// HTTP 请求工具
function httpRequest(reqUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(reqUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(parsed, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 15000,
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

// 从 provider 的 /v1/models 拉取模型列表
// 已知 Provider 的模型列表 URL
const KNOWN_MODEL_URLS = {
  '火山引擎 Coding Plan': 'https://ark.cn-beijing.volces.com/api/coding/v3/models',
  'OpenCode Go': 'https://opencode.ai/zen/go/v1/models',
  'DeepSeek': 'https://api.deepseek.com/models',
  'Ollama': 'http://localhost:11434/api/tags',
  'xiaomi': 'https://token-plan-cn.xiaomimimo.com/v1/models',
};

async function fetchModels(provider) {
  const keys = readKeys();
  const apiKey = keys[provider.name];
  
  // Ollama 本地部署不需要 API Key
  const isOllama = provider.vendor === 'ollama' || provider.name === 'Ollama';
  if (!isOllama && !apiKey) {
    throw new Error(`未配置 ${provider.name} 的 API Key`);
  }

  // 构建候选 URL 列表
  const candidates = [];
  
  // 1. 已知 Provider 的固定 URL
  if (KNOWN_MODEL_URLS[provider.name]) {
    candidates.push(KNOWN_MODEL_URLS[provider.name]);
  }

  // 2. 从现有模型中提取 base URL
  if (provider.models && provider.models.length > 0) {
    const urls = new Set();
    for (const m of provider.models) {
      try {
        const u = new URL(m.url);
        urls.add(`${u.protocol}//${u.host}`);
        const basePath = m.url.replace(/\/(chat\/completions|messages|responses)$/, '');
        urls.add(basePath);
      } catch {}
    }
    for (const u of urls) {
      candidates.push(u.replace(/\/+$/, '') + '/models');
      candidates.push(u.replace(/\/+$/, '') + '/v1/models');
    }
  }

  // 去重
  const uniqueCandidates = [...new Set(candidates)];

  for (const modelsUrl of uniqueCandidates) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      // Ollama 不需要 Authorization
      if (apiKey && !isOllama) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      
      const res = await httpRequest(modelsUrl, { headers });
      
      if (res.status !== 200) continue;

      const data = res.data;
      
      // 格式 1: 标准 OpenAI 格式 {data: [{id, owned_by, ...}]}
      if (data.data && Array.isArray(data.data)) {
        return {
          models: data.data.map(m => ({
            id: m.id,
            name: m.id,
            object: m.object,
            owned_by: m.owned_by || '',
          })),
          url: modelsUrl,
        };
      }
      
      // 格式 2: 火山引擎 {Result: {Datas: [{ModelID}]}}
      if (data.Result && data.Result.Datas && Array.isArray(data.Result.Datas)) {
        return {
          models: data.Result.Datas.map(m => ({
            id: m.ModelID,
            name: m.ModelID,
            owned_by: 'volcengine',
          })),
          url: modelsUrl,
        };
      }

      // 格式 3: Ollama {models: [{name, size, ...}]}
      if (data.models && Array.isArray(data.models)) {
        return {
          models: data.models.map(m => ({
            id: m.name || m.model,
            name: m.name || m.model,
            owned_by: 'ollama',
          })),
          url: modelsUrl,
        };
      }

      // 格式 4: 直接数组 [{id: ...}]
      if (Array.isArray(data)) {
        return {
          models: data.map(m => ({
            id: m.id || m.model_id || m.ModelID || m.name || String(m),
            name: m.name || m.id || m.model_id || String(m),
            owned_by: m.owned_by || '',
          })),
          url: modelsUrl,
        };
      }
    } catch (e) {
      // 继续尝试下一个
    }
  }

  throw new Error('所有模型端点均不可用，请手动添加模型');
}

// 请求处理
async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const startTime = Date.now();

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const json = (code, data) => {
    const duration = Date.now() - startTime;
    log.info(`${req.method} ${pathname} → ${code} (${duration}ms)`);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  try {
    // GET /api/heartbeat - 心跳
    if (pathname === '/api/heartbeat' && req.method === 'GET') {
      lastHeartbeat = Date.now();
      return json(200, { ok: true });
    }

    // GET /api/ccswitch - 读取 CC Switch 数据库
    if (pathname === '/api/ccswitch' && req.method === 'GET') {
      log.info('读取 CC Switch 数据库:', CCSWITCH_DB_PATH);
      if (!initSqlJs) return json(500, { error: 'sql.js 未安装' });
      if (!fs.existsSync(CCSWITCH_DB_PATH)) {
        log.warn('CC Switch 数据库不存在:', CCSWITCH_DB_PATH);
        return json(404, { error: 'CC Switch 数据库不存在: ' + CCSWITCH_DB_PATH });
      }
      
      const SQL = await initSqlJs();
      const buf = fs.readFileSync(CCSWITCH_DB_PATH);
      const db = new SQL.Database(buf);
      
      const providers = [];
      try {
        const cols = db.exec("PRAGMA table_info(providers)")[0]?.values?.map(r => r[1]) || [];
        const rows = db.exec("SELECT * FROM providers WHERE category != 'official'")[0]?.values || [];
        for (const row of rows) {
          const obj = {};
          cols.forEach((c, i) => obj[c] = row[i]);
          
          // 解析 settings_config JSON
          let config = {};
          try { config = JSON.parse(obj.settings_config || '{}'); } catch {}
          
          // 解析 meta JSON
          let meta = {};
          try { meta = JSON.parse(obj.meta || '{}'); } catch {}
          
          providers.push({
            id: obj.id,
            name: obj.name,
            appType: obj.app_type,
            category: obj.category,
            baseUrl: config.env?.ANTHROPIC_BASE_URL || config.env?.OPENAI_BASE_URL || '',
            apiKey: config.env?.ANTHROPIC_AUTH_TOKEN || config.env?.OPENAI_API_KEY || '',
            websiteUrl: obj.website_url,
            isCurrent: obj.is_current === 1,
            icon: obj.icon,
            iconColor: obj.icon_color,
            meta
          });
        }
      } catch (e) { /* ignore */ }
      
      const allTables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values?.map(r => r[0]) || [];
      db.close();
      log.info(`CC Switch 读取完成: ${providers.length} 个 Provider`);
      return json(200, { tables: allTables, providers });
    }

    // GET /api/config - 读取配置
    if (pathname === '/api/config' && req.method === 'GET') {
      log.info('读取配置文件');
      const config = readJSON(CONFIG_PATH);
      if (!config) {
        log.warn('配置文件不存在:', CONFIG_PATH);
        return json(404, { error: '配置文件不存在' });
      }
      // 前端不需要 apiKey，脱敏返回
      const safeConfig = Array.isArray(config) ? config.map(p => {
        const { apiKey, ...rest } = p;
        return rest;
      }) : config;
      log.info(`配置读取成功: ${safeConfig.length} 个 Provider`);
      return json(200, safeConfig);
    }

    // POST /api/config - 保存配置
    if (pathname === '/api/config' && req.method === 'POST') {
      const body = await readBody(req);
      // 合并 API Keys 到 config 中，使 chatLanguageModels.json 包含 apiKey
      const keys = readKeys();
      const mergedConfig = body.map(p => {
        const entry = { ...p };
        const apiKey = keys[p.name];
        if (apiKey) {
          entry.apiKey = apiKey;
        }
        return entry;
      });
      writeJSON(CONFIG_PATH, mergedConfig);
      log.info('配置已保存（含 API Key 合并）');
      return json(200, { success: true, path: CONFIG_PATH });
    }

    // GET /api/keys - 读取 API Keys（脱敏）
    if (pathname === '/api/keys' && req.method === 'GET') {
      const fileKeys = readJSON(KEYS_PATH) || {};
      const keys = readKeys();
      const result = {};
      for (const [k, v] of Object.entries(keys)) {
        if (!v) continue;
        const source = fileKeys[k] ? 'file' : 'env';
        result[k] = {
          masked: v.slice(0, 8) + '...',
          source,
        };
      }
      return json(200, result);
    }

    // GET /api/key/:name - 读取单个 API Key（明文，用于复制）
    if (pathname.startsWith('/api/key/') && req.method === 'GET') {
      const name = decodeURIComponent(pathname.slice('/api/key/'.length));
      const keys = readKeys();
      const key = keys[name];
      if (!key) return json(404, { error: 'Key 不存在' });
      return json(200, { key });
    }

    // POST /api/keys - 保存 API Key
    if (pathname === '/api/keys' && req.method === 'POST') {
      const body = await readBody(req);
      const keys = readKeys();
      Object.assign(keys, body);
      writeKeys(keys);
      // 同步更新 chatLanguageModels.json 中的 apiKey
      try {
        const config = readJSON(CONFIG_PATH);
        if (Array.isArray(config)) {
          const updatedConfig = config.map(p => {
            const entry = { ...p };
            const apiKey = keys[p.name];
            if (apiKey) {
              entry.apiKey = apiKey;
            }
            return entry;
          });
          writeJSON(CONFIG_PATH, updatedConfig);
          log.info('API Key 已同步到 chatLanguageModels.json');
        }
      } catch (e) {
        log.warn('同步 API Key 到配置文件失败:', e.message);
      }
      return json(200, { success: true });
    }

    // GET /api/url-history - 读取 URL 历史
    if (pathname === '/api/url-history' && req.method === 'GET') {
      const history = readJSON(URL_HISTORY_PATH) || {};
      return json(200, history);
    }

    // POST /api/url-history - 保存 URL 历史
    if (pathname === '/api/url-history' && req.method === 'POST') {
      const body = await readBody(req);
      writeJSON(URL_HISTORY_PATH, body);
      return json(200, { success: true });
    }

    // POST /api/fetch-models - 从远程拉取模型列表
    if (pathname === '/api/fetch-models' && req.method === 'POST') {
      const body = await readBody(req);
      const result = await fetchModels(body);
      return json(200, result);
    }

    // GET /api/quota - 读取用量限额数据
    if (pathname === '/api/quota' && req.method === 'GET') {
      const quota = readJSON(QUOTA_PATH) || {};
      log.debug('读取用量数据:', Object.keys(quota).length, '个 Provider');
      return json(200, quota);
    }

    // POST /api/quota - 保存用量限额数据
    if (pathname === '/api/quota' && req.method === 'POST') {
      const body = await readBody(req);
      writeJSON(QUOTA_PATH, body);
      log.info('用量数据已保存');
      return json(200, { success: true });
    }

    // POST /api/quota/fetch - 从远程 API 查询用量
    if (pathname === '/api/quota/fetch' && req.method === 'POST') {
      const body = await readBody(req);
      const { providerName, quotaUrl, apiKey } = body;
      
      if (!quotaUrl) return json(400, { error: '缺少 quotaUrl' });
      
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        
        const res = await httpRequest(quotaUrl, { headers });
        log.info(`用量查询: ${providerName} → ${res.status}`);
        
        if (res.status === 200) {
          return json(200, { data: res.data, url: quotaUrl });
        } else {
          return json(res.status, { error: `HTTP ${res.status}`, data: res.data });
        }
      } catch (e) {
        log.error('用量查询失败:', providerName, e.message);
        return json(500, { error: e.message });
      }
    }

    // GET / - 前端页面
    if (pathname === '/' || pathname === '/index.html') {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // POST /api/open-config - 用 VS Code 打开配置文件
    if (pathname === '/api/open-config' && req.method === 'POST') {
      const { exec } = require('child_process');
      try {
        log.info('打开配置文件:', CONFIG_PATH);
        exec(`code "${CONFIG_PATH}"`, { windowsHide: true });
        return json(200, { success: true });
      } catch (e) {
        log.error('打开配置文件失败:', e.message);
        return json(500, { error: e.message });
      }
    }

    // GET /api/logs - 读取日志
    if (pathname === '/api/logs' && req.method === 'GET') {
      try {
        const lines = parseInt(parsed.query.lines) || 200;
        const level = parsed.query.level || 'all';
        
        if (!fs.existsSync(LOG_PATH)) {
          return json(200, { logs: [] });
        }
        
        let content = fs.readFileSync(LOG_PATH, 'utf8');
        let logLines = content.split('\n').filter(l => l.trim());
        
        // 按级别过滤
        if (level !== 'all') {
          const levelUpper = `[${level.toUpperCase()}]`;
          logLines = logLines.filter(l => l.includes(levelUpper));
        }
        
        // 取最后 N 行
        logLines = logLines.slice(-lines);
        
        return json(200, { logs: logLines, path: LOG_PATH });
      } catch (e) {
        return json(500, { error: e.message });
      }
    }

    // DELETE /api/logs - 清空日志
    if (pathname === '/api/logs' && req.method === 'DELETE') {
      try {
        if (fs.existsSync(LOG_PATH)) {
          fs.writeFileSync(LOG_PATH, '', 'utf8');
          log.info('日志已清空');
        }
        return json(200, { success: true });
      } catch (e) {
        return json(500, { error: e.message });
      }
    }

    // GET /api/paths - 获取所有路径信息
    if (pathname === '/api/paths' && req.method === 'GET') {
      return json(200, {
        config: CONFIG_PATH,
        keys: KEYS_PATH,
        urlHistory: URL_HISTORY_PATH,
        quota: QUOTA_PATH,
        ccswitch: CCSWITCH_DB_PATH,
        logs: LOG_PATH,
        logDir: LOG_DIR,
        scriptDir: __dirname,
      });
    }

    json(404, { error: 'Not Found' });
  } catch (e) {
    log.error('请求处理错误:', e.message);
    json(500, { error: e.message });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// 心跳检测：浏览器每 5 秒发一次，30 秒无心跳自动关闭
let lastHeartbeat = Date.now();
const HEARTBEAT_TIMEOUT = 30000; // 30 秒

// 定时检查心跳
setInterval(() => {
  if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
    log.warn('浏览器已断开，自动释放端口...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 2000);
  }
}, 10000); // 每 10 秒检查一次

const server = http.createServer(handleRequest);

// 优雅关闭，释放端口
function shutdown(signal) {
  log.info(`收到 ${signal}，正在关闭...`);
  server.close(() => {
    log.info('端口已释放');
    process.exit(0);
  });
  // 3 秒后强制退出
  setTimeout(() => process.exit(1), 3000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// Windows: ctrl+close 窗口
process.on('SIGHUP', () => shutdown('SIGHUP'));

// 自动找可用端口
function startServer(preferredPort) {
  server.listen(preferredPort, () => {
    const addr = server.address();
    PORT = addr.port;
    log.info('='.repeat(50));
    log.info('Copilot Model Manager 已启动');
    log.info(`地址: http://localhost:${PORT}`);
    log.info(`配置: ${CONFIG_PATH}`);
    log.info('='.repeat(50));

    // 自动打开独立窗口（Edge/Chrome app 模式，无地址栏和标签页）
    const { exec } = require('child_process');
    const appUrl = `http://localhost:${PORT}`;

    // 查找可用的 Chromium 浏览器（Edge / Chrome）
    const browserPaths = [
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    const browserPath = browserPaths.find(p => { try { return fs.existsSync(p); } catch { return false; } });

    // 图标：打包模式下从 snapshot 复制到磁盘（--icon 需要真实文件路径）
    const realIconPath = path.join(BASE_DIR, 'icon.ico');
    if (!fs.existsSync(realIconPath)) {
      try {
        const snapshotIcon = path.join(__dirname, 'icon.ico');
        if (fs.existsSync(snapshotIcon)) fs.copyFileSync(snapshotIcon, realIconPath);
      } catch {}
    }
    const iconArg = fs.existsSync(realIconPath) ? `--icon="${realIconPath}"` : '';

    if (browserPath) {
      const browserName = path.basename(browserPath, '.exe');
      const edgeProfile = path.join(BASE_DIR, '.edge-profile');
      log.info(`浏览器: ${browserName} (独立窗口)`);
      exec(`"${browserPath}" --app="${appUrl}" --user-data-dir="${edgeProfile}" ${iconArg}`, { windowsHide: true });
    } else {
      log.info('浏览器: 系统默认');
      try { exec(`start "" "${appUrl}"`, { windowsHide: true }); } catch {}
    }

    log.info('按 Ctrl+C 停止');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log.warn(`端口 ${preferredPort} 已占用，尝试随机端口...`);
      server.listen(0); // 0 = 系统分配可用端口
    } else {
      log.error('启动失败:', err.message);
      process.exit(1);
    }
  });
}

startServer(PORT);
