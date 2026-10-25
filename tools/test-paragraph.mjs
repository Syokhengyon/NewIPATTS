/*
 * test-paragraph.mjs — 验证标点停顿、分段、单段朗读
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
/* 合成桩：记录调用次数，并**真的追踪** 10 秒收尾定时器的存活情况 ——
   只数创建不数清除是量不出泄漏的（先前就是这么误判的）。 */
let synthCalls = 0;
const liveTimers = new Set();
const origST = window.setTimeout, origCT = window.clearTimeout;
window.setTimeout = (fn, ms) => {
  const h = origST(fn, ms);
  if (ms === 10000) liveTimers.add(h);
  return h;
};
window.clearTimeout = (h) => { liveTimers.delete(h); return origCT(h); };
window.eSpeakNG = class {
  constructor(u, cb) { setTimeout(() => cb && cb(), 0); }
  set_rate() {} set_pitch() {} set_voice() {} delete() {}
  synthesize(t, cb) {
    synthCalls++;
    const buf = new Float32Array(400);
    for (let i = 0; i < 200; i++) { buf[i * 2] = Math.sin(i / 8) * 0.4; buf[i * 2 + 1] = buf[i * 2]; }
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
await tick(700);

const $ = id => doc.getElementById(id);
const cells = () => [...doc.querySelectorAll('#canvas .cell')];
const find = ch => cells().find(c => c.querySelector('.ch').textContent === ch);
const txt = () => cells().map(c => c.querySelector('.ch').textContent).join('');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}${x ? '  ' + x : ''}`); } else { fail++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); } };

console.log('=== 启动 ===');
check('无 JS 错误', errors.length === 0, errors.join(' | '));

console.log('\n=== ① 標點保留爲停頓，不再一律丟掉 ===');
$('text').value = '天地，玄黃。宇宙、洪荒！';
$('deriveOnly').click();
await tick(250);
check('漢字齊全', txt() === '天地玄黃宇宙洪荒', txt());
const pauses = [...doc.querySelectorAll('#canvas .pause')];
check('產生停頓標記', pauses.length === 4, `${pauses.length} 個`);
check('逗號→短停頓', pauses.filter(p => !p.classList.contains('long')).length === 2,
  `短 ${pauses.filter(p => !p.classList.contains('long')).length} 個`);
check('句末→長停頓', pauses.filter(p => p.classList.contains('long')).length === 2,
  `長 ${pauses.filter(p => p.classList.contains('long')).length} 個`);
check('停頓不佔字格', !pauses.some(p => p.classList.contains('cell')));
check('停頓有 title 說明', pauses[0].title.length > 0, pauses[0].title);

console.log('\n=== ② 括號仍被正確處理（不影響其他標點）===');
$('text').value = '天（辛棄疾），地。';
$('deriveOnly').click();
await tick(250);
check('括號不成爲字格', !txt().includes('（') && !txt().includes('）'), txt());
check('括號內文字照常', txt() === '天辛棄疾地', txt());
check('逗號句號仍在', doc.querySelectorAll('#canvas .pause').length === 2,
  `${doc.querySelectorAll('#canvas .pause').length} 個`);
$('text').value = '天(透開四先平)，地。';
$('deriveOnly').click();
await tick(250);
check('注音括號仍生效', find('天') && find('天').classList.contains('fixed'), find('天')?.className);
check('注音後逗號仍在', doc.querySelectorAll('#canvas .pause').length === 2);

console.log('\n=== ③ 空行分段 ===');
$('text').value = '第一段文字。\n\n第二段文字。\n\n第三段。';
$('deriveOnly').click();
await tick(250);
const paraBoxes = [...doc.querySelectorAll('#canvas .para')];
check('分成 3 段', paraBoxes.length === 3, `${paraBoxes.length} 段`);
check('每段有標題', paraBoxes.every(b => /段落 \d/.test(b.querySelector('.para-hd').textContent)));
check('每段有「只唸這段」按鈕', paraBoxes.every(b => b.querySelector('.para-hd button')));
check('段內字正確', paraBoxes[0].querySelectorAll('.ch').length === 5 &&
  [...paraBoxes[0].querySelectorAll('.ch')].map(c => c.textContent).join('') === '第一段文字',
  [...paraBoxes[0].querySelectorAll('.ch')].map(c => c.textContent).join(''));

console.log('\n=== ④ 單段朗讀（下拉 + 按鈕）===');
const sel = $('paraPick');
check('下拉可見', sel.style.display !== 'none', `display=${sel.style.display || '(空)'}`);
check('下拉列出全部段 + 各段', sel.options.length === 4, `${sel.options.length} 項`);
check('選項文字含段號與字數', /第 1 段（5 字）/.test(sel.options[1].textContent), sel.options[1].textContent);
/* 只唸第 2 段（「第二段文字」5 字） */
synthCalls = 0;
sel.value = '1';
sel.dispatchEvent(new window.Event('change'));
await tick(600);
check('只合成第 2 段的字數', synthCalls === 5, `呼叫 ${synthCalls} 次（第2段 5 字）`);
/* 全文：簽名變了，應重新合成而非重播第 2 段 */
synthCalls = 0;
sel.value = '';
$('tbPlay').click();
await tick(1200);
check('切回全文會重新合成', synthCalls === 13, `呼叫 ${synthCalls} 次（共 13 字）`);
/* 同樣條件再按 ▶ 應該是重播（不再合成） */
synthCalls = 0;
$('tbPlay').click();
await tick(300);
check('同條件再按 ▶ 只重播', synthCalls === 0, `又呼叫 ${synthCalls} 次`);
/* 段落按鈕 */
synthCalls = 0;
paraBoxes[2].querySelector('.para-hd button').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(500);
check('段落按鈕只唸該段', synthCalls === 3, `呼叫 ${synthCalls} 次（第3段 3 字）`);

console.log('\n=== ⑤ 長文本不會留下待決定時器（OOM 根因）===');
liveTimers.clear();
synthCalls = 0;
$('paraPick').value = '';
$('text').value = '天地玄黃宇宙洪荒日月盈昃列令行山兄來魚月補牆病惡呂辰宿列張'.repeat(2);
$('deriveOnly').click();
await tick(300);
$('tbPlay').click();
await tick(3500);
check('合成呼叫數正確', synthCalls === 58, `${synthCalls} 次（29 字 × 2 遍）`);
check('無殘留的 10 秒收尾定時器', liveTimers.size === 0,
  `殘留 ${liveTimers.size} 個（修復前每合成一字殘留一個，長文本會 OOM）`);

console.log('\n=== ⑥ 行內空格 → 微停頓（比逗號短）===');
{
  const pauses = () => [...doc.querySelectorAll('#canvas .pause')];
  const chs = () => cells().map(c => c.querySelector('.ch').textContent).join('');

  $('text').value = '天 地';
  $('deriveOnly').click();
  await tick(250);
  check('單空格產生停頓', pauses().length === 1, `${pauses().length} 個`);
  check('標為微停頓（無 short/long 類）',
    pauses()[0] && !pauses()[0].classList.contains('short') && !pauses()[0].classList.contains('long'),
    pauses()[0]?.className);
  check('title 說明是微停頓', /微停頓/.test(pauses()[0]?.title || ''), pauses()[0]?.title);

  $('text').value = '天   地';
  $('deriveOnly').click();
  await tick(250);
  check('多個空格合併成一個停頓', pauses().length === 1, `${pauses().length} 個`);

  $('text').value = '天　地';
  $('deriveOnly').click();
  await tick(250);
  check('全角空格（U+3000）也算', pauses().length === 1, `${pauses().length} 個`);

  $('text').value = '　　天地';
  $('deriveOnly').click();
  await tick(250);
  check('行首縮排不產生停頓', pauses().length === 0, `${pauses().length} 個`);
  check('縮排後漢字齊全', chs() === '天地', chs());

  $('text').value = '天地   \n玄黃';
  $('deriveOnly').click();
  await tick(250);
  check('行尾空格不產生停頓', pauses().length === 0, `${pauses().length} 個`);

  $('text').value = '天 地，玄。';
  $('deriveOnly').click();
  await tick(250);
  const ps = pauses();
  check('三種停頓都在', ps.length === 3, `${ps.length} 個`);
  check('層次：微 → 短 → 長',
    ps[0] && !ps[0].classList.contains('short') && !ps[0].classList.contains('long') &&
    !!ps[1]?.classList.contains('short') && !ps[1]?.classList.contains('long') &&
    !!ps[2]?.classList.contains('long'),
    ps.map(p => p.className).join(' | '));
}

console.log('\n=== ⑦ 回歸：範例詞 ===');
setText($, HEIXINNIANG);
await tick(80);
$('deriveOnly').click();
await tick(500);
check('字格數量合理', cells().length > 120, `${cells().length}`);
check('仍有多音字', cells().some(c => c.classList.contains('multi')));
check('仍有綠色固定字', cells().some(c => c.classList.contains('fixed')));
check('標點成爲停頓', doc.querySelectorAll('#canvas .pause').length > 5,
  `${doc.querySelectorAll('#canvas .pause').length} 個`);
/* 分段規則改了：只有**空行**才分段，單個換行只是行內換行（見 parseAnnotated）。
   以前 j 從 i 起算導致每個換行都被當空行，每行自成一段，所以下面這兩條是回歸。 */
setText($, '天地玄黃\n宇宙洪荒\n日月盈昃');
await tick(80);
$('deriveOnly').click();
await tick(400);
check('單換行不分段（不畫段落框）', doc.querySelectorAll('#canvas .para').length === 0,
  `${doc.querySelectorAll('#canvas .para').length} 個框`);
check('單換行仍分三行', doc.querySelectorAll('#canvas .line').length === 3,
  `${doc.querySelectorAll('#canvas .line').length} 行`);

setText($, '天地玄黃\n宇宙洪荒\n\n日月盈昃\n辰宿列張');
await tick(80);
$('deriveOnly').click();
await tick(400);
const paras = [...doc.querySelectorAll('#canvas .para')];
check('空行才分段', paras.length === 2, `${paras.length} 段`);
check('空行前的兩行同屬一段',
  paras.length === 2 && paras[0].querySelectorAll('.line').length === 2,
  paras.length === 2 ? `第一段 ${paras[0].querySelectorAll('.line').length} 行` : '段數不對');

console.log(`\n${'='.repeat(52)}`);
console.log(`通過 ${pass} / 失敗 ${fail}`);
if (errors.length) { console.log('JS 错误：'); errors.forEach(e => console.log('  ' + e)); }
process.exit(fail || errors.length ? 1 : 0);
