/*
 * test-annotated.mjs — 验证「字(音韻地位)」括號注音功能
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
  '/vendor/tshet-uinh.js': 'node_modules/tshet-uinh/index.js',
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
await tick(400);

const $ = id => doc.getElementById(id);
const cells = () => [...doc.querySelectorAll('#canvas .cell')];
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}${x ? '  ' + x : ''}`); } else { fail++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); } };

console.log('=== 启动 ===');
check('无 JS 错误', errors.length === 0, errors.join(' | '));
check('texts/ 下拉框已綁定', !!$('textPick') && !!$('textPick').onchange);

console.log('\n=== ① 推導並辨識括號注音 ===');
setText($, HEIXINNIANG);
await tick(80);
const poem = $('text').value;
check('貼入了詞', poem.includes('賀新郎') && poem.includes('(幫三虞上)'), `${poem.length} 字`);

console.log('\n=== ② 推導並辨識括號注音 ===');
$('deriveOnly').click();
await tick(300);
const cs = cells();
check('生成了字格', cs.length > 0, `${cs.length} 格`);

const fixedCells = cs.filter(c => c.classList.contains('fixed'));
check('有綠色（已固定）的字', fixedCells.length > 0, `${fixedCells.length} 個`);

const txt = cells().map(c => c.querySelector('.ch').textContent).join('');
check('括號內容不出現在結果裏', !/[()（）]/.test(txt), JSON.stringify(txt.slice(0, 30)));
check('括號內的字沒被當成正文',
  !txt.includes('幫三虞上') && !txt.includes('定開一泰去') && !txt.includes('見開四先去') && !txt.includes('見開三微上'));
check('正文漢字齊全', txt.startsWith('賀新郎同父見和再用韻答之'), txt.slice(0, 16));

const fixedChars = fixedCells.map(c => c.querySelector('.ch').textContent).join('');
/* 注音跟在**被注的那個字**後面：
   同父(幫三虞上) → 注的是「父」；老大(定開一泰去) → 注的是「大」。
   所以 同/老/堪/兩/男 本來就是普通字。 */
check('已固定的字正確', fixedChars === '父見大説事樣別幾番離合汗車斷兒', fixedChars);

console.log('\n=== ③ 固定讀音是否正確 ===');
const find = (ch) => cells().find(c => c.querySelector('.ch').textContent === ch);
/* 「見」在詞中只出現一次（同父見和…），且已被括號固定 */
const jian = cells().filter(c => c.querySelector('.ch').textContent === '見');
check('「見」出現一次', jian.length === 1, `${jian.length}`);
check('「見」已固定（非藍色）', jian.every(c => c.classList.contains('fixed') && !c.classList.contains('multi')));
check('「見」標題顯示固定的地位', jian[0].title.includes('見開四先去'), jian[0].title.split('\n')[0]);
/* 省略「類」的寫法應被自動補全 */
const fu = find('父');
check('「父」被固定（原寫 幫三虞上，省了類）', fu && fu.classList.contains('fixed'), fu?.className);
check('自動補全為 幫三C虞上', fu && fu.title.includes('幫三C虞上'), fu?.title.split('\n')[0]);
const ji = find('幾');
check('「幾」被固定（原寫 見開三微上，省了類）', ji && ji.classList.contains('fixed') && !ji.classList.contains('multi'), ji?.className);
check('「幾」補全為 見開三C微上', ji && ji.title.includes('見開三C微上'), ji?.title.split('\n')[0]);
const fan = find('番');
check('「番」補全為 滂三C元平', fan && fan.title.includes('滂三C元平'), fan?.title.split('\n')[0]);
/* 「辛棄疾」不是合法音韻地位 → 按普通文字處理 */
const xin = find('辛');
check('「辛棄疾」未被誤認為注音', xin && !xin.classList.contains('fixed'), xin?.className);

console.log('\n=== ④ 統計資訊 ===');
check('統計含「固定」', ($('resInfo').textContent || '').includes('固定'), $('resInfo').textContent);
check('統計含多音字', ($('resInfo').textContent || '').includes('多音字'), $('resInfo').textContent);
check('日誌報告固定數', ($('log').textContent || '').includes('讀音已固定'), '');

console.log('\n=== ⑤ 全角括號也支援 ===');
$('text').value = '天（透開四先平）地';
$('deriveOnly').click();
await tick(250);
const cs2 = cells();
check('全角括號被識別', cs2.length === 2 && cs2[0].classList.contains('fixed'), `${cs2.length} 格，${cs2[0]?.className}`);
check('全角括號內容不顯示', !cs2.some(c => c.querySelector('.ch').textContent === '（'));

console.log('\n=== ⑥ 標點不成為字格 ===');
$('text').value = '天、地。玄！黃？宇；宙';
$('deriveOnly').click();
await tick(250);
const csP = cells();
check('標點被略去', csP.map(c => c.querySelector('.ch').textContent).join('') === '天地玄黃宇宙',
  csP.map(c => c.querySelector('.ch').textContent).join(''));
check('句末標點造成換行', doc.querySelectorAll('#canvas .line').length >= 3,
  `${doc.querySelectorAll('#canvas .line').length} 行`);

console.log('\n=== ⑦ 非法括號按普通文字處理 ===');
$('text').value = '天(不是地位)地';
$('deriveOnly').click();
await tick(250);
const cs3 = cells();
check('不誤判為注音', !cs3.some(c => c.classList.contains('fixed')), `${cs3.length} 格`);
check('括號內的字照常推導', cs3.map(c => c.querySelector('.ch').textContent).join('') === '天不是地位地',
  cs3.map(c => c.querySelector('.ch').textContent).join(''));

console.log('\n=== ⑧ 一鍵播放清單用固定讀音 ===');
setText($, HEIXINNIANG);
await tick(80);
$('deriveOnly').click();
await tick(300);
const nCells = cells().length;
const ipas = cells().map(c => c.querySelector('.ipa').textContent).filter(t => t && t !== '—' && t !== '✗');
check('成功率高', ipas.length / nCells > 0.9, `${ipas.length}/${nCells}`);
check('IPA 無殘留括號', !ipas.some(t => /[()（）]/.test(t)));

console.log(`\n${'='.repeat(50)}`);
console.log(`通過 ${pass} / 失敗 ${fail}`);
if (errors.length) { console.log('JS 错误：'); errors.forEach(e => console.log('  ' + e)); }
process.exit(fail || errors.length ? 1 : 0);
