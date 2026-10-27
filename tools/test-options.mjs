/*
 * test-options.mjs — 验证设定项的「次级选项」显示逻辑
 *   用 derivers/普通話_當代.txt：第二项「臻深咸山曾梗入聲字主元音」在
 *   「寫出入聲韻尾」取消勾选时应当消失，重新勾上时应当回来。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'web', 'derive.html'), 'utf8');
const SCHEME = '普通話_當代.txt';

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail?.message || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc, url: 'http://127.0.0.1:8981/' });
const { window } = dom;
const doc = window.document;
window.AudioContext = class { constructor() { this.state = 'running'; } resume() {} createBuffer() { return { copyToChannel() {} }; } createBufferSource() { return { connect() {}, start() {}, stop() {} }; } };
window.Worker = class { constructor() {} postMessage() {} terminate() {} addEventListener() {} };
window.fetch = async (u) => {
  const url = String(u).split('?')[0];
  if (url.startsWith('/api/')) {
    if (url === '/api/derivers') {
      const l = [{ name: SCHEME, url: '/derivers/' + encodeURIComponent(SCHEME), size: 0 }];
      return { ok: true, status: 200, text: async () => JSON.stringify(l), json: async () => l };
    }
    const dir = url === '/api/texts' ? 'texts' : 'derivers';
    let list = [];
    try {
      list = fs.readdirSync(path.join(ROOT, dir)).filter(f => ['.txt', '.js', '.mjs'].includes(path.extname(f).toLowerCase()))
        .sort().map(f => ({ name: f, url: '/' + dir + '/' + encodeURIComponent(f), size: 0 }));
    } catch (e) {}
    return { ok: true, status: 200, text: async () => JSON.stringify(list), json: async () => list };
  }
  const p = path.join(ROOT, decodeURIComponent(url.replace(/^\//, '')));
  const ok = fs.existsSync(p);
  const txt = ok ? fs.readFileSync(p, 'utf8') : '';
  return { ok, status: ok ? 200 : 404, text: async () => txt, json: async () => JSON.parse(txt || '{}') };
};
window.eSpeakNG = class { constructor(u, cb) { setTimeout(() => cb && cb(), 0); } set_rate() {} set_pitch() {} set_voice() {} delete() {} synthesize(t, cb) { const b = new Float32Array(2); setTimeout(() => { cb(b); cb(null); }, 0); } };
window.URL.createObjectURL = () => 'blob:x';
window.navigator.clipboard = { writeText: async () => {} };

for (const f of ['node_modules/tshet-uinh/index.js', 'node_modules/tshet-uinh-deriver-tools/dist/index.js']) window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const mod = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
let src = mod;
for (const [full, namesRaw, href] of [...mod.matchAll(/import\s+\{([^}]+)\}\s+from\s+'([^']+)'/g)]) {
  const abs = path.join(ROOT, href.replace(/^\//, ''));
  const specs = namesRaw.split(',').map(s => s.trim()).filter(Boolean);
  const exps = [], dest = [];
  for (const sp of specs) { const m = sp.match(/^(\S+)\s+as\s+(\S+)$/); if (m) { exps.push(m[1]); dest.push(`${m[1]}: ${m[2]}`); } else { exps.push(sp); dest.push(sp); } }
  const key = '__m_' + href.replace(/\W/g, '_');
  const body = fs.readFileSync(abs, 'utf8').replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm, '');
  window.eval(`window.${key} = (function(){ ${body}\n; return {${exps.join(',')}}; })()`);
  src = src.replace(full, `const {${dest.join(',')}} = window.${key};`);
}
window.eval(src);
doc.dispatchEvent(new window.Event('DOMContentLoaded'));
window.dispatchEvent(new window.Event('load'));
const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));
await tick(800);

const $ = id => doc.getElementById(id);
const keys = () => [...doc.querySelectorAll('#options [data-k]')].map(e => e.dataset.k);
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}${x ? '  ' + x : ''}`); } else { fail++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); } };

console.log('=== 启动 ===');
check('无 JS 错误', errors.length === 0, errors.join(' | '));
const pick = $('deriverPick');
check('方案下拉框已填充', !!pick && [...pick.options].some(o => o.textContent === SCHEME), pick ? [...pick.options].map(o => o.textContent).join(',') : '(无)');

if (pick) {
  pick.value = '/derivers/' + encodeURIComponent(SCHEME);
  pick.dispatchEvent(new window.Event('change'));
  await tick(400);
  const a = keys();
  console.log('  初始设定项（' + a.length + '）：' + JSON.stringify(a));
  check('三项都显示', a.length === 3, String(a.length));
  check('含次级选项', a.includes('臻深咸山曾梗入聲字主元音'));

  const cb = doc.querySelector('#options [data-k="寫出入聲韻尾"]');
  check('找到「寫出入聲韻尾」勾选框', !!cb);

  /* 先把次级选项改成「併入 ə」，看隐藏再显示后值是否保住 */
  const sel = doc.querySelector('#options [data-k="臻深咸山曾梗入聲字主元音"]');
  check('找到次级选项下拉框', !!sel);
  if (sel) {
    const idx = [...sel.options].findIndex(o => o.textContent === '併入 ə');
    sel.selectedIndex = idx;
    sel.dispatchEvent(new window.Event('change'));
    await tick(150);
  }

  if (cb) {
    cb.checked = false;
    cb.dispatchEvent(new window.Event('change'));
    await tick(200);
    const b = keys();
    console.log('  取消勾选后（' + b.length + '）：' + JSON.stringify(b));
    check('次级选项已隐藏', !b.includes('臻深咸山曾梗入聲字主元音'));
    check('其余两项仍在', b.length === 2, JSON.stringify(b));

    const cb2 = doc.querySelector('#options [data-k="寫出入聲韻尾"]');
    cb2.checked = true;
    cb2.dispatchEvent(new window.Event('change'));
    await tick(200);
    const c = keys();
    console.log('  重新勾选后（' + c.length + '）：' + JSON.stringify(c));
    check('次级选项恢复', c.includes('臻深咸山曾梗入聲字主元音'));
    check('又是三项', c.length === 3, String(c.length));
    const sel2 = doc.querySelector('#options [data-k="臻深咸山曾梗入聲字主元音"]');
    check('隐藏期间保住的取值', !!sel2 && sel2.options[sel2.selectedIndex].textContent === '併入 ə',
      sel2 ? sel2.options[sel2.selectedIndex].textContent : '(无)');
  }
}

console.log(`\n${'='.repeat(46)}`);
console.log(`通過 ${pass} / 失敗 ${fail}`);
if (errors.length) { console.log('JS 错误：'); errors.forEach(e => console.log('  ' + e)); }
process.exit(fail || errors.length ? 1 : 0);
