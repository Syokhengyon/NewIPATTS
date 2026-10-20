/*
 * test-fallback.mjs — 验证「類推」与三色标记
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { HEIXINNIANG, setText } from './fixtures.mjs';

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
  '/reference/site-fallback-table.json': 'reference/site-fallback-table.json',
  '/reference/site-variant-table.json': 'reference/site-variant-table.json',
};
const fetchLog = [];
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
  fetchLog.push(`${url} -> ${ok ? txt.length + ' 字符' : '404'}`);
  return { ok, status: ok ? 200 : 404, text: async () => txt, json: async () => JSON.parse(txt || '{}') };
};
window.eSpeakNG = class { constructor(u, cb) { setTimeout(() => cb && cb(), 0); } set_rate() {} set_pitch() {} set_voice() {} delete() {} synthesize(t, cb) { setTimeout(() => cb(null), 0); } };
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
await tick(700);   // 等補充字表載入

const $ = id => doc.getElementById(id);
const cells = () => [...doc.querySelectorAll('#canvas .cell')];
const find = ch => cells().find(c => c.querySelector('.ch').textContent === ch);
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}${x ? '  ' + x : ''}`); } else { fail++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); } };

console.log('=== 启动 ===');
check('无 JS 错误', errors.length === 0, errors.join(' | '));
console.log('  fetch: ' + fetchLog.join(' | '));
check('補充字表已載入', ($('log').textContent || '').includes('補充字表已載入'),
  (($('log').textContent || '').match(/補充字表已載入[^\n]*/) || [''])[0]);

console.log('\n=== ① 「窗」應為黃色（類推）===');
$('text').value = '窗';
$('deriveOnly').click();
await tick(250);
const cw = find('窗');
check('生成了字格', !!cw);
check('標為 guess（黃）', cw && cw.classList.contains('guess'), cw?.className);
check('不是 err（紅）', cw && !cw.classList.contains('err'), cw?.className);
check('有 IPA', cw && cw.querySelector('.ipa').textContent.trim() !== '✗' && cw.querySelector('.ipa').textContent.trim() !== '—',
  cw?.querySelector('.ipa').textContent);
check('title 說明來源', cw && cw.title.includes('類推'), cw?.title.split('\n')[0]);
check('日誌報告類推數', ($('log').textContent || '').includes('類推'), '');

console.log('\n=== ② 對照：「窻」在廣韻裏，應為灰色 ===');
$('text').value = '窻';
$('deriveOnly').click();
await tick(250);
const ca = find('窻');
check('不是 guess', ca && !ca.classList.contains('guess'), ca?.className);
check('不是 err', ca && !ca.classList.contains('err'), ca?.className);
check('IPA 與窗一致', ca && cw && ca.querySelector('.ipa').textContent === cw.querySelector('.ipa').textContent,
  `${ca?.querySelector('.ipa').textContent} vs ${cw?.querySelector('.ipa').textContent}`);

console.log('\n=== ③ 兩表都沒有的字應為紅色 ===');
$('text').value = '𠀀';
$('deriveOnly').click();
await tick(250);
const cb = find('𠀀');
check('標為 err（紅）', cb && cb.classList.contains('err'), cb?.className);
check('不是 guess', cb && !cb.classList.contains('guess'), cb?.className);
check('title 說明', cb && cb.title.includes('查不到'), cb?.title);

console.log('\n=== ④ 括號固定但與廣韻不合 → 紅色 ===');
/* 「天」廣韻作 透開四先平。故意註成完全不同的地位 */
$('text').value = '天(幫三C虞上)';
$('deriveOnly').click();
await tick(250);
const ct = find('天');
check('標為 err（紅）', ct && ct.classList.contains('err'), ct?.className);
check('不是 fixed（綠）', ct && !ct.classList.contains('fixed'), ct?.className);
check('title 說明不合', ct && ct.title.includes('不合'), ct?.title.split('\n')[0]);
check('日誌有警告', ($('log').textContent || '').includes('兩者不合'), '');

console.log('\n=== ⑤ 括號固定且與廣韻相合 → 綠色 ===');
$('text').value = '天(透開四先平)';
$('deriveOnly').click();
await tick(250);
const ct2 = find('天');
check('標為 fixed（綠）', ct2 && ct2.classList.contains('fixed'), ct2?.className);
check('不是 err', ct2 && !ct2.classList.contains('err'), ct2?.className);

console.log('\n=== ⑥ 括號固定一個廣韻沒有的地位 → 綠（無從判斷不合）===');
$('text').value = '窗(初二江平)';
$('deriveOnly').click();
await tick(250);
const cw2 = find('窗');
check('標為 fixed（綠）', cw2 && cw2.classList.contains('fixed'), cw2?.className);
check('不是 err', cw2 && !cw2.classList.contains('err'), cw2?.className);

console.log('\n=== ⑦ 統計與圖例 ===');
$('text').value = '窗窻𠀀';
$('deriveOnly').click();
await tick(250);
const info = $('resInfo').textContent;
check('統計含類推', info.includes('類推'), info);
check('圖例含四色說明', ($('canvas').textContent || '').includes('類推') && ($('canvas').textContent || '').includes('紅'),
  ($('canvas').querySelector('.legend')?.textContent || '').slice(0, 60));

console.log('\n=== ⑧ 回歸：範例詞仍正常 ===');
setText($, HEIXINNIANG);
await tick(80);
$('deriveOnly').click();
await tick(400);
const cs = cells();
const fixedN = cs.filter(c => c.classList.contains('fixed')).length;
const guessN = cs.filter(c => c.classList.contains('guess')).length;
const errN = cs.filter(c => c.classList.contains('err')).length;
check('字格數量合理', cs.length > 120, `${cs.length}`);
check('有綠色固定字', fixedN >= 15, `${fixedN} 個`);
check('有黃色類推字', guessN > 0, `${guessN} 個`);
check('紅字很少', errN <= 3, `${errN} 個`);
/* 「窗」在詞中嗎？不在。但「説」等仍應正常 */

console.log('\n=== ⑨ 簡化字（經異體字表類推）===');
/* 注意：「体」本身就在廣韻裏（並一魂上，蒲本切，粗笨義），
   所以它按廣韻字處理而不是類推 —— 這才是對的，不要拿它當簡化字樣本。 */
for (const [s, want] of [['国', '國'], ['汉', '漢'], ['语', '語'], ['见', '見'], ['东', '東'], ['说', '說']]) {
  $('text').value = s;
  $('deriveOnly').click();
  await tick(200);
  const c = find(s);
  const inGw = (window.TshetUinh.資料.query字頭(s) || []).length > 0;
  if (inGw) {
    check(`${s} 本就在廣韻裏（不應類推）`, c && !c.classList.contains('guess') && !c.classList.contains('err'),
      `${c?.className}  ${c?.querySelector('.ipa').textContent}`);
  } else {
    check(`${s} 可推導（經「${want}」）`, c && c.classList.contains('guess') && !c.classList.contains('err'),
      `${c?.className}  ${c?.querySelector('.ipa').textContent}`);
    check(`${s} title 說明經由`, c && c.title.includes('異體字'), c?.title.split('\n')[0]);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`通過 ${pass} / 失敗 ${fail}`);
if (errors.length) { console.log('JS 错误：'); errors.forEach(e => console.log('  ' + e)); }
console.log('\nfetch: ' + fetchLog.join('\n       '));
process.exit(fail || errors.length ? 1 : 0);
