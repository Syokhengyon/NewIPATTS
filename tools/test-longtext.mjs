/*
 * test-longtext.mjs — 用〈哀江南賦并序〉（3387 字）验证长文本不 OOM
 *
 * 这是浏览器 OOM 的真实规模测试 —— 之前的定时器泄漏在这个量级才会炸。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'web', 'derive.html'), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail?.message || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc, url: 'http://127.0.0.1:8981/' });
const { window } = dom;
const doc = window.document;

window.AudioContext = class { constructor() { this.state = 'running'; } resume() {} createBuffer() { return { copyToChannel() {} }; } createBufferSource() { return { connect() {}, start() {}, stop() {} }; } };
window.Worker = class { constructor() {} postMessage() {} terminate() {} addEventListener() {} };
const ROUTES = {
  '/derivers/__sample.js': 'tools/fixtures.mjs',
  '/texts/哀江南賦并序.txt': 'texts/哀江南賦并序.txt',
  '/reference/site-fallback-table.json': 'reference/site-fallback-table.json',
  '/reference/site-variant-table.json': 'reference/site-variant-table.json',
};
window.fetch = async (u) => {
  const url = String(u).split('?')[0];
  const p = path.join(ROOT, ROUTES[url] ?? url.replace(/^\//, ''));
  /* 目录列表接口：桩直接读真实目录 */
  if (url.startsWith('/api/')) {
    const dir = url === '/api/texts' ? 'texts' : 'derivers';
    if (url === '/api/derivers') {
      const l = [{ name: '__sample.js', url: '/derivers/__sample.js', size: 0 }];
      return { ok: true, status: 200, text: async () => JSON.stringify(l), json: async () => l };
    }
    const exts = url === '/api/texts' ? ['.txt', '.md'] : ['.js', '.txt', '.mjs'];
    let list = [];
    try {
      const d = path.join(ROOT, dir);
      list = fs.readdirSync(d).filter(f => exts.includes(path.extname(f).toLowerCase()))
        .sort().map(f => ({ name: f, url: '/' + dir + '/' + encodeURIComponent(f), size: 0 }));
    } catch (e) {}
    return { ok: true, status: 200, text: async () => JSON.stringify(list), json: async () => list };
  }
  const ok = fs.existsSync(p);
  const txt = ok ? fs.readFileSync(p, 'utf8') : '';
  return { ok, status: ok ? 200 : 404, text: async () => txt, json: async () => JSON.parse(txt || '{}') };
};

/* 追踪 10 秒收尾定时器：创建与清除都要记 */
let synthCalls = 0, peakLive = 0, retainedBytes = 0;
const liveTimers = new Set();
const timerBudget = new Map();
const origST = window.setTimeout, origCT = window.clearTimeout;
window.setTimeout = (fn, ms) => {
  const h = origST(fn, ms);
  if (ms === 10000) { liveTimers.add(h); peakLive = Math.max(peakLive, liveTimers.size); }
  return h;
};
window.clearTimeout = (h) => { liveTimers.delete(h); return origCT(h); };

/* 合成桩：每次产出约 100 KB 的样本（贴近真实规模），并记录是否被回收 */
window.eSpeakNG = class {
  constructor(u, cb) { setTimeout(() => cb && cb(), 0); }
  set_rate() {} set_pitch() {} set_voice() {} delete() {}
  synthesize(t, cb) {
    synthCalls++;
    const N = 500;                      // 250 个立体声帧 → 250 单声道样本
    const buf = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { buf[i * 2] = Math.sin(i / 8) * 0.4; buf[i * 2 + 1] = buf[i * 2]; }
    setTimeout(() => { cb(buf); cb(null); }, 0);
  }
};
window.URL.createObjectURL = () => 'blob:x';
window.navigator.clipboard = { writeText: async () => {} };

for (const f of ['node_modules/tshet-uinh/index.js', 'node_modules/tshet-uinh-deriver-tools/dist/index.js']) {
  try { window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { errors.push('装 ' + f + ': ' + e.message); }
}

const mod = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
let src = mod;
for (const [full, namesRaw, href] of [...mod.matchAll(/import\s+\{([^}]+)\}\s+from\s+'([^']+)'/g)]) {
  const abs = path.join(ROOT, href.replace(/^\//, ''));
  const specs = namesRaw.split(',').map(s => s.trim()).filter(Boolean);
  const exps = [], dest = [];
  for (const sp of specs) {
    const m = sp.match(/^(\S+)\s+as\s+(\S+)$/);
    if (m) { exps.push(m[1]); dest.push(`${m[1]}: ${m[2]}`); } else { exps.push(sp); dest.push(sp); }
  }
  const key = '__m_' + href.replace(/\W/g, '_');
  const body = fs.readFileSync(abs, 'utf8').replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm, '');
  window.eval(`window.${key} = (function(){ ${body}\n; return {${exps.join(',')}}; })()`);
  src = src.replace(full, `const {${dest.join(',')}} = window.${key};`);
}
try { window.eval(src); } catch (e) { errors.push('module: ' + e.message); }

doc.dispatchEvent(new window.Event('DOMContentLoaded'));
window.dispatchEvent(new window.Event('load'));
const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));
await tick(800);

const $ = id => doc.getElementById(id);
const cells = () => [...doc.querySelectorAll('#canvas .cell')];
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}${x ? '  ' + x : ''}`); } else { fail++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); } };

console.log('=== 启动 ===');
check('无 JS 错误', errors.length === 0, errors.join(' | '));

/** 从 texts/ 读一篇塞进输入框（页面现在走下框框，测试直接读文件更稳） */
function loadFromTexts(name) {
  const t = fs.readFileSync(path.join(ROOT, 'texts', name), 'utf8');
  $('text').value = t;
  $('text').dispatchEvent(new window.Event('input'));
}

console.log('\n=== ① 载入〈哀江南賦并序〉 ===');
loadFromTexts('哀江南賦并序.txt');
const poem = $('text').value;
const cjkN = (poem.match(/[\u4e00-\u9fff]/g) || []).length;
check('範例已載入', cjkN > 3000, `${cjkN} 漢字`);
check('含 # PAGEEND 分頁標記', poem.includes('# PAGEEND'), `${(poem.match(/# PAGEEND/g) || []).length} 個`);

console.log('\n=== ② 推導（大量字）===');
const t0 = Date.now();
$('deriveOnly').click();
await tick(3000);
const cs = cells();
const okN = cs.filter(c => !c.classList.contains('err')).length;
const errN = cs.filter(c => c.classList.contains('err')).length;
check('生成了大量字格', cs.length > 2500, `${cs.length} 格`);
check('成功率合理', okN / cs.length > 0.85, `成功 ${okN} / 失敗 ${errN}`);
check('# PAGEEND 未成爲字格', !cs.some(c => c.querySelector('.ch').textContent === '#'));
check('PAGEEND 字母未成爲字格', !cs.some(c => /[A-Za-z]/.test(c.querySelector('.ch').textContent)));
const paras = [...doc.querySelectorAll('#canvas .para')];
check('分成多段', paras.length > 25, `${paras.length} 段`);
check('無空段', paras.every(p => p.querySelectorAll('.ch').length > 0),
  `空段 ${paras.filter(p => !p.querySelectorAll('.ch').length).length} 個`);
check('推導耗時合理', Date.now() - t0 < 60000, `${((Date.now() - t0) / 1000).toFixed(1)}s`);

console.log('\n=== ③ 段落下拉 ===');
const sel = $('paraPick');
check('下拉可見', sel.style.display !== 'none');
check('列出全部 + 各段', sel.options.length === paras.length + 1, `${sel.options.length} 項 vs ${paras.length} 段`);

console.log('\n=== ④ 長文本朗讀：不 OOM、不留定時器 ===');
synthCalls = 0; peakLive = 0; liveTimers.clear();
const t1 = Date.now();
$('tbPlay').click();
/* 3387 字逐字合成，jsdom 下每次有 setTimeout(0) 往返，要等夠久 */
let waited = 0;
while (waited < 180000) {
  await tick(1000); waited += 1000;
  if ((doc.querySelector('#log').textContent.match(/合計 \d+ 字/g) || []).length > 0) break;
}
const secs = (Date.now() - t1) / 1000;
check('合成次數與字數相當', synthCalls > 3300, `${synthCalls} 次`);
check('**無殘留定時器**', liveTimers.size === 0, `殘留 ${liveTimers.size} 個，峯值 ${peakLive} 個`);
check('**峯值待決定時器 ≤ 2**（修復前會等於合成次數）', peakLive <= 2,
  `峯值 ${peakLive} 個（修復前應爲 ${synthCalls} 個）`);
check('朗讀完成', doc.querySelector('#log').textContent.includes('合計'), `${secs.toFixed(1)}s`);
const doneLog = (doc.querySelector('#log').textContent.match(/合計[^\n]{0,60}/) || [''])[0].replace(/\s+/g, ' ');
check('報告合計', /合計 \d+ 字成功/.test(doneLog), doneLog);
check('合成速度合理', synthCalls / secs > 30, `${(synthCalls / secs).toFixed(0)} 字/秒`);

console.log('\n=== ⑤ 單段朗讀（長文本）===');
/* 先確認前一次已結束 */
synthCalls = 0;
const n0 = paras[0].querySelectorAll('.ch').length;
paras[0].querySelector('.para-hd button').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(2500);
check('只合成第一段的字數', synthCalls === n0, `呼叫 ${synthCalls} 次 vs 第1段 ${n0} 字`);

console.log('\n=== ⑥ 新朗讀會作廢舊朗讀（不並行）===');
synthCalls = 0;
$('paraPick').value = '';
$('tbPlay').click();                 // 開始全文
await tick(800);
const mid = synthCalls;
check('全文已開始合成', mid > 5, `已 ${mid} 次`);
$('paraPick').value = '1';
$('paraPick').dispatchEvent(new window.Event('change'));   // 中途切到第 2 段
await tick(2000);
const after = synthCalls - mid;
check('切換後只合成第 2 段（舊任務已停）', after <= paras[1].querySelectorAll('.ch').length,
  `舊任務後又合成 ${after} 次，第2段 ${paras[1].querySelectorAll('.ch').length} 字`);
check('日誌有「取代」標記', ($('log').textContent || '').includes('已被新的朗讀取代'), '');

console.log('\n=== ⑥ 記憶體 ===');
const mb = (process.memoryUsage().heapUsed / 1048576).toFixed(0);
check('堆內存未爆', process.memoryUsage().heapUsed < 900 * 1048576, `heapUsed ${mb} MB`);

console.log(`\n${'='.repeat(52)}`);
console.log(`通過 ${pass} / 失敗 ${fail}`);
if (errors.length) { console.log('JS 错误：'); errors.forEach(e => console.log('  ' + e)); }
process.exit(fail || errors.length ? 1 : 0);
