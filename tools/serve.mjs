/*
 * serve.mjs — 本地靜態服務，供瀏覽器界面使用
 * 用法: node tools/serve.mjs [端口]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = parseInt(process.argv[2] || '8981', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const ROUTES = {
  '/': '/web/derive.html',          // 主界面：推導模式
  '/derive': '/web/derive.html',
  '/ipa': '/web/index.html',        // IPA 直輸 / 字表
  '/chart': '/web/chart.html',      // IPA 逐音素驗證表 + 聲調驗證
  '/vendor/tshet-uinh.js': 'node_modules/tshet-uinh/index.js',
  '/vendor/deriver-tools.js': 'node_modules/tshet-uinh-deriver-tools/dist/index.js',
  '/reference/site-fallback-table.json': 'reference/site-fallback-table.json',
  '/reference/site-variant-table.json': 'reference/site-variant-table.json',
};
/*
 * 原站點本地副本（/site 路由）已移除。
 *   它依賴 site-copy/ 這個準備好的目錄（index.html、duyin.html、
 *   duyin-web.js、duyin-web_bg.wasm 共 29 MB）。現在只剩 site-source/ 的原始檔，
 *   而那是站點作者的編譯產物 —— 打包發佈時不適合一起帶上。
 *   需要的話，自己把 site-source/ 整理成 site-copy/ 再放回路由即可。
 */

/*
 * 兩個專門目錄的列表接口 —— 頁面用它填充下拉框，
 * 這樣往 texts/ 或 derivers/ 裏丟檔案就直接出現在界面上了。
 */
const LIST_DIRS = {
  '/api/texts': { dir: 'texts', exts: ['.txt', '.md'] },
  '/api/derivers': { dir: 'derivers', exts: ['.js', '.txt', '.mjs'] },
};

const MIME_EXTRA = { '.wasm': 'application/wasm' };

/*
 * 保存接口：只允許寫入 texts/ 與 derivers/ 兩個目錄。
 *
 * 安全措施（這個服務只監聽 127.0.0.1，但仍然按規矩做）：
 *   · 目錄名白名單，不接受任意路徑
 *   · 檔名拒絕路徑分隔符、`..`、開頭為點
 *   · 解析後再確認最終路徑確實落在目標目錄內
 *   · 大小上限 4 MB
 */
const SAVE_DIRS = { texts: ['.txt', '.md'], derivers: ['.js', '.txt', '.mjs'] };
const MAX_SAVE = 4 * 1024 * 1024;

function handleSave(req, res) {
  let body = '';
  req.on('data', c => {
    body += c;
    if (body.length > MAX_SAVE * 2) { req.destroy(); }
  });
  req.on('end', () => {
    const fail = (code, msg) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: msg }));
    };
    let data;
    try { data = JSON.parse(body); } catch (e) { return fail(400, '請求不是合法 JSON'); }
    const dir = String(data.dir || '');
    const name = String(data.name || '').trim();
    const content = String(data.content ?? '');
    if (!SAVE_DIRS[dir]) return fail(400, '目錄不允許：' + dir);
    if (!name) return fail(400, '檔名為空');
    if (/[\\/]/.test(name) || name.includes('..') || name.startsWith('.')) return fail(400, '檔名不合法');
    if (content.length > MAX_SAVE) return fail(413, '內容過大（上限 4 MB）');
    const ext = path.extname(name).toLowerCase();
    if (!SAVE_DIRS[dir].includes(ext)) return fail(400, `${dir}/ 只收 ${SAVE_DIRS[dir].join(' ')}`);
    const base = path.join(ROOT, dir);
    const abs = path.join(base, name);
    if (!abs.startsWith(base + path.sep)) return fail(403, '路徑越界');
    fs.mkdirSync(base, { recursive: true });
    fs.writeFile(abs, content, 'utf8', (err) => {
      if (err) return fail(500, err.message);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, dir, name, bytes: Buffer.byteLength(content, 'utf8') }));
      console.log(`  [save] ${dir}/${name}  ${Buffer.byteLength(content, 'utf8')} bytes`);
    });
  });
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  /* 保存接口 */
  if (p === '/api/save') {
    if (req.method !== 'POST') { res.writeHead(405); res.end('use POST'); return; }
    return handleSave(req, res);
  }
  /* 目录列表接口 */
  if (LIST_DIRS[p]) {
    const { dir, exts } = LIST_DIRS[p];
    const abs = path.join(ROOT, dir);
    let files = [];
    try {
      files = fs.readdirSync(abs)
        .filter(f => exts.includes(path.extname(f).toLowerCase()))
        .sort()
        .map(f => ({ name: f, url: '/' + dir + '/' + encodeURIComponent(f),
                     size: fs.statSync(path.join(abs, f)).size }));
    } catch (e) { /* 目录不存在 → 空列表 */ }
    const body = JSON.stringify(files);
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
    return;
  }
  if (ROUTES[p]) p = ROUTES[p];
  else if (p.startsWith('/site/')) { res.writeHead(404); res.end('site copy removed'); return; }
  else if (p === '/') p = '/web/index.html';
  const abs = path.join(ROOT, p);
  if (!abs.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 ' + p);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(abs).toLowerCase()] || MIME_EXTRA[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'no-store',
    });
    fs.createReadStream(abs).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  IPA 讀音合成 — 瀏覽器界面`);
  console.log(`  http://127.0.0.1:${PORT}/\n`);
  console.log(`  靜態根目錄: ${ROOT}\n`);
});
server.on('error', e => { console.error('啟動失敗:', e.message); process.exit(1); });
