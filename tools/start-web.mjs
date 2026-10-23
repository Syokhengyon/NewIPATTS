/*
 * start-web.mjs — 一鍵啟動本地服務（Windows 上雙擊 start.bat 即可）
 *
 * 做的事：
 *   1. 檢查 Node.js 版本（需要 ≥ 18）
 *   2. 檢查 node_modules/，缺了就自動跑 npm install
 *      （失敗會改用專案內的快取目錄再試一次，繞過「npm 快取目錄不可寫」的 EPERM）
 *   3. 挑一個空閒端口（預設 8981，被佔用就往後找；若 8981 上已經是本服務，直接開瀏覽器）
 *   4. 啟動 tools/serve.mjs，等它真的能回應 HTTP，再打開瀏覽器
 *
 * 用法：
 *   node tools/start-web.mjs                 預設 8981
 *   node tools/start-web.mjs --port 9000     指定端口
 *   node tools/start-web.mjs --no-open       不自動打開瀏覽器
 *   node tools/start-web.mjs --install       強制重跑 npm install
 *   node tools/start-web.mjs --help          顯示說明
 *
 * 這個檔案只用 Node 內建模組 —— 完全沒有 node_modules 也能跑起來，
 * 因為裝依賴正是它的工作之一。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

/* ───────────────────────── 路徑與常數 ───────────────────────── */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVE = path.join(ROOT, 'tools', 'serve.mjs');
/* serve.mjs 的 /vendor 路由直接讀這兩個檔，缺了推導頁就沒 TshetUinh */
const DEP_REQUIRED = path.join(ROOT, 'node_modules', 'tshet-uinh', 'index.js');
const DEP_OPTIONAL = path.join(ROOT, 'node_modules', 'tshet-uinh-deriver-tools', 'dist', 'index.js');
const DEFAULT_PORT = 8981;

const RULE = '─'.repeat(58);
const RULE_HEAVY = '═'.repeat(58);

/* ───────────────────────── 命令行參數 ───────────────────────── */

const argv = process.argv.slice(2);

function hasFlag(...names) {
  return names.some(n => argv.includes(n));
}

function optValue(...names) {
  for (const n of names) {
    const i = argv.indexOf(n);
    /* 下一個值如果又是個 --旗標，說明這個選項沒帶值 */
    if (i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('-')) return argv[i + 1];
    const hit = argv.find(a => a.startsWith(n + '='));
    if (hit) return hit.slice(n.length + 1);
  }
  return undefined;
}

const NO_OPEN = hasFlag('--no-open', '-n');
const NO_PAUSE = hasFlag('--no-pause') || Boolean(process.env.IPATTS_NO_PAUSE);
const FORCE_INSTALL = hasFlag('--install', '--reinstall');
const WANT_HELP = hasFlag('--help', '-h', '/?');

/* ───────────────────────── 小工具 ───────────────────────── */

class LauncherError extends Error {
  constructor(message, hints = []) {
    super(message);
    this.name = 'LauncherError';
    this.hints = hints;
  }
}

/*
 * 顏色只在「確定吃得下 ANSI」的終端才開：
 * 舊的 conhost 不支援，亂寫轉義序列會讓整個窗口更難看。
 */
const COLOR = (() => {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return false;
  if (process.platform !== 'win32') return true;
  return Boolean(
    process.env.WT_SESSION ||          // Windows Terminal
    process.env.TERM_PROGRAM ||        // VS Code / 其它終端
    process.env.ANSICON ||             // ANSICON
    process.env.ConEmuANSI === 'ON',   // ConEmu
  );
})();

const ANSI = { red: 31, green: 32, yellow: 33, cyan: 36, dim: 2 };

function c(name, text) {
  const code = ANSI[name];
  return COLOR && code ? `\u001b[${code}m${text}\u001b[0m` : text;
}

const out = (s = '') => process.stdout.write(s + '\n');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function pause() {
  if (NO_PAUSE || !process.stdin.isTTY) return Promise.resolve();
  out('');
  process.stdout.write(' 按 Enter 鍵關閉這個窗口…');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.once('line', () => { rl.close(); resolve(); });
  });
}

function printHelp() {
  out('');
  out(' IPA 讀音合成 — 本地服務一鍵啟動');
  out(' ' + RULE);
  out(' 用法：');
  out('   start.bat [選項]                 Windows 雙擊或命令行');
  out('   node tools/start-web.mjs [選項]  直接跑腳本');
  out('');
  out(' 選項：');
  out('   -p, --port <端口>   指定端口（預設 8981；被佔用會自動往後找）');
  out('   -n, --no-open       不自動打開瀏覽器');
  out('       --install       強制重新執行 npm install');
  out('       --no-pause      結束時不等待按鍵');
  out('   -h, --help          顯示這段說明');
  out('');
  out(' 環境變數：');
  out('   IPATTS_PORT         等同 --port');
  out('   IPATTS_NO_PAUSE=1   等同 --no-pause');
  out('   NO_COLOR=1          關掉顏色');
  out(' ' + RULE);
  out('');
}

function banner() {
  out('');
  out(c('cyan', ' ' + RULE_HEAVY));
  out(c('cyan', '  IPA 讀音合成 v1') + c('dim', ' —— 本地服務一鍵啟動'));
  out(c('cyan', ' ' + RULE_HEAVY));
  out(c('dim', `  專案目錄  ${ROOT}`));
  out('');
}

function parsePort(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new LauncherError(`端口不合法：「${raw}」（要 1–65535 的整數）`, [
      '例：start.bat --port 9000',
    ]);
  }
  return n;
}

/* ───────────────────────── 端口偵測 ───────────────────────── */

/** 這個端口現在能不能被我們 listen（true = 空閒） */
function canListen(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

/** 讓系統分配一個空閒端口（前面 20 個端口全被佔用時的保底） */
function ephemeralPort() {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(DEFAULT_PORT + 50));
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * 試着 GET 一下 127.0.0.1:port。
 * 連不上／超時 → null；連上 → { status, body }（body 最多取 4000 字）。
 */
function probePage(port, pathname = '/', timeout = 2500) {
  return new Promise(resolve => {
    let settled = false;
    const done = value => { if (!settled) { settled = true; resolve(value); } };

    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout }, res => {
      if (res.statusCode !== 200) { res.resume(); return done({ status: res.statusCode, body: '' }); }
      res.setEncoding('utf8');
      let body = '';
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 4000) { body = body.slice(0, 4000); req.destroy(); done({ status: 200, body }); }
      });
      res.on('end', () => done({ status: 200, body }));
      res.on('error', () => done(null));
    });
    req.on('timeout', () => { req.destroy(); done(null); });
    req.on('error', () => done(null));
  });
}

/**
 * 決定用哪個端口。
 *   · 端口空閒             → 就用它
 *   · 端口上已經是這服務   → already:true（不重複啟動，只開瀏覽器）
 *   · 端口被別的程式佔用   → 往後找空閒的
 */
async function pickPort(wanted) {
  if (await canListen(wanted)) return { port: wanted, already: false };

  const probe = await probePage(wanted);
  if (probe && probe.status === 200 && /IPA|讀音合成|切韻|TshetUinh/.test(probe.body)) {
    return { port: wanted, already: true };
  }

  for (let p = wanted + 1; p <= Math.min(wanted + 20, 65535); p++) {
    if (await canListen(p)) return { port: p, already: false, movedFrom: wanted };
  }
  return { port: await ephemeralPort(), already: false, movedFrom: wanted };
}

/* ───────────────────────── npm install ───────────────────────── */

/**
 * 找到 npm 的啟動方式。
 * 優先用 node.exe + npm-cli.js —— 不必經過 npm.cmd 這個批次檔，
 * 也就不會踩到「Node 22+ 不許直接 spawn .cmd」的 EINVAL。
 */
function npmInvocation() {
  const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(cli)) return { file: process.execPath, lead: [cli], shell: false };

  const names = process.platform === 'win32' ? ['npm.cmd', 'npm'] : ['npm'];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const clean = dir.replace(/^"|"$/g, '').trim();
    if (!clean) continue;
    for (const name of names) {
      const full = path.join(clean, name);
      if (fs.existsSync(full)) return { file: full, lead: [], shell: process.platform === 'win32' };
    }
  }
  return null;
}

/** 跑 npm install，輸出直接接到當前終端（stdio: inherit），回傳退出碼 */
function runInstall(extra = []) {
  const npm = npmInvocation();
  if (!npm) {
    return Promise.resolve({ code: -1, error: '找不到 npm（Node.js 似乎沒裝完整）' });
  }
  const file = npm.shell && /[\s()]/.test(npm.file) ? `"${npm.file}"` : npm.file;
  const args = [...npm.lead, 'install', '--no-audit', '--no-fund', ...extra];

  return new Promise(resolve => {
    let child;
    try {
      child = spawn(file, args, { cwd: ROOT, stdio: 'inherit', shell: npm.shell, windowsHide: true });
    } catch (err) {
      return resolve({ code: -1, error: err.message });
    }
    child.once('error', err => resolve({ code: -1, error: err.message }));
    child.once('exit', code => resolve({ code }));
  });
}

/** 把子進程退出碼翻成人話 —— Windows 上失敗時常常是一個很大的無符號數 */
function exitText(res) {
  if (res && res.error) return res.error;
  const code = res ? res.code : undefined;
  if (code === -1 || code === undefined) return '無法啟動 npm';
  if (code === null) return '被中斷';
  if (code >= 0 && code <= 255) return `退出碼 ${code}`;
  return `系統錯誤 ${code >= 0x80000000 ? code - 0x100000000 : code}`;
}

async function ensureDeps() {
  const needInstall = FORCE_INSTALL || !fs.existsSync(DEP_REQUIRED);
  const depReady = fs.existsSync(DEP_REQUIRED);

  out(` [2/3] 檢查依賴套件     ${needInstall ? c('yellow', '需要安裝') : c('green', '已就緒')}`);

  if (needInstall) {
    out(c('dim', '       → npm install（首次運行要下載套件，約 10–60 秒，只做一次）'));
    out('');
    let res = await runInstall([]);
    if (res.code !== 0) {
      out('');
      out(c('yellow', `       npm install 沒成功（${exitText(res)}），改用專案內的快取目錄重試…`));
      res = await runInstall(['--cache', path.join(ROOT, '.npm-cache')]);
    }
    out('');
    if (res.code !== 0 || !fs.existsSync(DEP_REQUIRED)) {
      throw new LauncherError(`依賴沒有裝上（npm install 沒成功：${exitText(res)}）。`, [
        '先在專案目錄開一個命令行，手動跑一次看完整報錯：',
        '    npm install --cache .npm-cache',
        '常見原因：連不上 npm registry（代理／防火牆）、或 npm 快取目錄不可寫（上面的寫法已把快取指到專案內）。',
        '裝好之後再雙擊 start.bat，之後就不會再跑 npm install。',
      ]);
    }
    out(' [2/3] 依賴套件         ' + c('green', '安裝完成'));
  } else if (!fs.existsSync(DEP_OPTIONAL)) {
    out(c('dim', '       提示：可選依賴 tshet-uinh-deriver-tools 沒裝上 ——'));
    out(c('dim', '             推導方案的設定項只能用簡式 [[鍵, 值]]，其餘功能不受影響'));
  }
  return depReady;
}

/* ───────────────────────── 服務進程 ───────────────────────── */

let serverChild = null;

function startServer(port) {
  return spawn(process.execPath, [SERVE, String(port)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

/** 一直等到服務真的能回應 HTTP，才認爲啟動成功（而不是「進程起來了」就算） */
async function waitReady(port, child, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return { ok: false, exited: true, code: child.exitCode };
    if (child.signalCode) return { ok: false, exited: true, code: null };
    const probe = await probePage(port, '/', 1500);
    if (probe && probe.status === 200) return { ok: true };
    await sleep(300);
  }
  return { ok: false, exited: false };
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      /* cmd /c start "" <url>：空字串佔住 start 的「視窗標題」位，網址才不會被當成標題 */
      spawn('cmd.exe', ['/c', 'start', '""', url], {
        stdio: 'ignore',
        windowsHide: true,
        windowsVerbatimArguments: true,
        detached: true,
      }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    }
    return true;
  } catch {
    return false;
  }
}

function stopChild() {
  if (serverChild && serverChild.exitCode === null && !serverChild.signalCode) {
    try { serverChild.kill(); } catch { /* 已經沒了就算了 */ }
  }
}

/* ───────────────────────── 主流程 ───────────────────────── */

async function main() {
  if (WANT_HELP) {
    printHelp();
    return 0;
  }

  process.title = 'IPA 讀音合成 · 本地服務';
  banner();

  /* ① 運行環境 */
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const nodeLabel = `Node.js v${process.versions.node}`;
  out(` [1/3] 檢查運行環境     ${nodeMajor >= 18 ? c('green', nodeLabel) : c('red', `${nodeLabel}（需要 ≥ 18）`)}`);
  if (nodeMajor < 18) {
    throw new LauncherError('Node.js 版本太舊，需要 18 或以上。', [
      '到 https://nodejs.org/zh-cn/download 下載 LTS 版安裝，裝完再雙擊 start.bat。',
      '安裝過程保持預設選項即可（會自動加進 PATH）。',
    ]);
  }
  if (!fs.existsSync(SERVE)) {
    throw new LauncherError('找不到 tools/serve.mjs。', [
      'start.bat 與 tools/start-web.mjs 必須放在專案根目錄（與 package.json 同一層）。',
    ]);
  }

  /* ② 依賴 */
  await ensureDeps();

  /* ③ 端口 + 啟動 */
  const portArg = optValue('--port', '-p');
  if (portArg === undefined && (argv.includes('--port') || argv.includes('-p'))) {
    throw new LauncherError('--port 後面少了端口值。', ['例：start.bat --port 9000']);
  }
  const wanted = parsePort(portArg ?? process.env.IPATTS_PORT);
  const pick = await pickPort(wanted);

  if (pick.already) {
    const url = `http://127.0.0.1:${pick.port}/`;
    out(` [3/3] 啟動本地服務     ${c('green', '已在運行')}`);
    out('');
    out(` 端口 ${pick.port} 上已經有這個服務在跑，直接為你打開瀏覽器。`);
    out(`   ${c('cyan', url)}`);
    out(c('dim', '   （服務在那個窗口裏；要停止就關掉那個窗口）'));
    if (!NO_OPEN) openBrowser(url);
    await pause();
    return 0;
  }

  if (pick.movedFrom !== undefined) {
    out(` [3/3] 啟動本地服務     ${c('yellow', `端口 ${pick.movedFrom} 被佔用 → 改用 ${pick.port}`)}`);
  } else {
    out(` [3/3] 啟動本地服務     ${c('dim', `端口 ${pick.port}`)}`);
  }

  const child = startServer(pick.port);
  serverChild = child;

  const ready = await waitReady(pick.port, child);
  if (!ready.ok) {
    stopChild();
    if (ready.exited) {
      throw new LauncherError(`服務啟動後立即退出（${ready.code === null ? '被信號終止' : `退出碼 ${ready.code}`}）。`, [
        '多半是端口在「檢查」與「啟動」之間被別的程式搶走了 —— 再雙擊一次 start.bat 通常就好。',
        '也可以指定別的端口：start.bat --port 9000',
      ]);
    }
    throw new LauncherError('等了 25 秒，服務仍未就緒。', [
      '看上面有沒有 serve.mjs 的報錯。',
      '防火牆／安全軟件偶爾會攔本地端口，放行 node.exe 即可。',
    ]);
  }

  const url = `http://127.0.0.1:${pick.port}/`;
  out(` [3/3] 服務就緒         ${c('green', url)}`);
  out('');
  if (!NO_OPEN) openBrowser(url);

  out(' ' + RULE_HEAVY);
  out(`  ${c('green', '已啟動')}   ${url}`);
  out(' ' + RULE);
  out(`   主界面（切韻推導）    ${url}`);
  out(`   IPA 直輸 / 字表       ${url}ipa`);
  out(`   音素驗證表            ${url}chart`);
  out(' ' + RULE);
  out('   · 瀏覽器沒自動打開的話，把上面的地址貼進瀏覽器就好');
  out('   · 必須走 http:// 訪問；直接雙擊 web/*.html 會被瀏覽器攔掉（ES module / Worker）');
  out('   · 停止服務：關掉這個窗口；或按 Ctrl+C（cmd 可能再問一句 Y/N）');
  out(' ' + RULE_HEAVY);
  out('');

  /* 服務在前台跑：它活多久這個窗口就留多久 */
  const exit = await new Promise(resolve => {
    if (child.exitCode !== null) return resolve({ code: child.exitCode });
    child.once('exit', code => resolve({ code }));
  });

  serverChild = null;
  out('');
  /* code 爲 null 表示被信號結束（例如外部 taskkill）—— 也算正常收攤 */
  if (exit.code === 0 || exit.code === null) {
    out(' 服務已停止。');
    return 0;
  }
  out(c('red', ` 服務意外退出（退出碼 ${exit.code}）。`));
  out(c('dim', ' 常見原因：端口被佔用、或 serve.mjs 自己報錯（看上面的輸出）。'));
  await pause();
  return 1;
}

function reportError(err) {
  out('');
  out(' ' + RULE);
  out(' ' + c('red', '啟動失敗'));
  out('');
  out('  ' + (err && err.message ? err.message : String(err)));
  const hints = (err && err.hints) || [];
  if (hints.length) {
    out('');
    for (const hint of hints) out('  ' + hint);
  } else {
    out(c('dim', '  （把上面這段原樣貼出來比較容易定位；也可以先手動 node tools/serve.mjs 看詳情）'));
  }
  out(' ' + RULE);
}

/* ───────────────────────── 入口 ───────────────────────── */

process.on('SIGINT', () => {
  out('');
  out(' 已停止服務。');
  stopChild();
  process.exit(0);
});

(async () => {
  let code = 0;
  try {
    code = await main();
  } catch (err) {
    code = 1;
    stopChild();
    reportError(err);
    await pause();
  }
  process.exit(code);
})();
