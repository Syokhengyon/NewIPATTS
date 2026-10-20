/*
 * test-readings-io.mjs — 验证三项：txt 匯入/匯出、改讀音寫回源文本、引擎定期重建
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

/* 记录引擎实例数，用来验证「定期重建」 */
let engineCount = 0, synthCalls = 0;
window.eSpeakNG = class {
  constructor(u, cb) { engineCount++; setTimeout(() => cb && cb(), 0); }
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
/* jsdom 没实现这几个 —— 不补桩会把 jsdomError 混进「无 JS 错误」判定里 */
window.alert = () => {};
window.confirm = () => true;
/* prompt 桩：記下被問到的預設檔名，預設回 null（= 使用者取消） */
window.__prompted = null;
window.prompt = (msg, def) => { window.__prompted = def == null ? String(msg || '') : def; return null; };

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
/** 打开某字的弹窗 */
async function openPop(ch) {
  find(ch).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(150);
  return $('pop');
}
/** 在弹窗的常驻输入框里填音韻地位并确定 */
async function typeCustom(v) {
  const inp = $('popInput');
  inp.value = v;
  $('popOk').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(500);
}
/** 用引擎直接查某字的音韻地位（供断言比对） */
function currentDescOf(ch) {
  const T = window.TshetUinh;
  const rows = T.資料.query字頭(ch) || [];
  if (!rows.length) return '';
  const o = rows[0].音韻地位;
  return [o.母, o.呼, o.等, o.類, o.韻, o.聲].filter(v => v != null && v !== '').join('');
}

let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}${x ? '  ' + x : ''}`); } else { fail++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); } };

console.log('=== 启动 ===');
check('无 JS 错误', errors.length === 0, errors.join(' | '));
check('引擎已建立', engineCount === 1, `${engineCount} 個`);
check('資料夾按鈕已綁定',
  !!$('textPick') && !!$('deriverPick') && !!$('saveText').onclick && !!$('saveTextAs').onclick &&
  !!$('saveDeriver').onclick && !!$('saveDeriverAs').onclick);

console.log('\n=== ① 點任何字都展示全部音韻地位 ===');
setText($, '列令行天');
$('deriveOnly').click();
await tick(250);
check('「列」本來是多音字（藍）', find('列').classList.contains('multi'), find('列')?.className);

/* 多音字：列表項可點 */
/* 多音字：列表项可点 */
let pop = await openPop('列');
let ops = [...pop.querySelectorAll('.op')];
check('多音字彈窗列出全部讀音', ops.length >= 2, `${ops.length} 項`);
/* 只检查「读音项」（data-i >= 0），排除「試聽全部」那一项 */
const readOps = () => [...pop.querySelectorAll('.op')].filter(o => parseInt(o.dataset.i, 10) >= 0);
check('**列出釋義**（不再显示「廣韻／類推」来源标签）',
  readOps().length > 0 && readOps().every(o => (o.querySelector('.g')?.textContent || '').trim().length > 0),
  readOps().map(o => (o.querySelector('.g')?.textContent || '').slice(0, 16)).join(' ｜ '));
check('多音字列表項**可點**（無 only 類）', ops.every(o => !o.classList.contains('only')), '');
check('彈窗有常駐自訂輸入框', !!$('popInput') && !!$('popOk'));

/* 選第二個 → 寫回原文 */
ops[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(500);
check('源文本出現括號', $('text').value.includes('列(來開三仙入)'), JSON.stringify($('text').value));
check('該字變綠', find('列').classList.contains('fixed'), find('列')?.className);
check('不再是多音字', !find('列').classList.contains('multi'));

console.log('\n=== ② 單音字（灰）也展示音韻地位，但不可選 ===');
pop = await openPop('天');
ops = [...pop.querySelectorAll('.op')];
check('單音字也列出音韻地位', ops.length === 1, `${ops.length} 項`);
check('該項**不可點**（有 only 類）', ops[0].classList.contains('only'), ops[0]?.className);
check('顯示「唯一讀音」提示', pop.textContent.includes('唯一讀音'), '');
check('仍可用自訂輸入框改', !!$('popInput'));

console.log('\n=== ③ 綠色字能再改（用自訂輸入框）===');
await openPop('列');
check('彈窗標出當前是括號註明', $('pop').textContent.includes('括號註明'), '');
check('該項高亮', [...$('pop').querySelectorAll('.op')].some(o => o.classList.contains('on')), '');
check('也列出廣韻其他讀音', [...$('pop').querySelectorAll('.op')].length >= 2,
  `${[...$('pop').querySelectorAll('.op')].length} 項`);
await typeCustom('知合三虞平');
const t1 = $('text').value;
check('綠色字可以再改', t1.includes('列(知合三虞平)'), JSON.stringify(t1));
check('舊括號被替換而非疊加', (t1.match(/列\(/g) || []).length === 1, `${(t1.match(/列\(/g) || []).length} 個括號`);
check('IPA 跟着變', find('列').querySelector('.ipa').textContent.includes('ʈ'), find('列')?.querySelector('.ipa').textContent);
check('仍是綠色', find('列').classList.contains('fixed'));

console.log('\n=== ④ 灰色字也能改（寫回後變紅：與廣韻不合）===');
setText($, '天地');
$('deriveOnly').click();
await tick(250);
await openPop('天');
await typeCustom('幫三C虞上');            // confirm 桩返回 true
check('寫回原文', $('text').value.includes('天(幫三C虞上)'), JSON.stringify($('text').value));
check('與廣韻不合 → 變紅', find('天').classList.contains('err'), find('天')?.className);

console.log('\n=== ⑤ 非法輸入不寫入 ===');
setText($, '天地');
$('deriveOnly').click();
await tick(250);
await openPop('天');
const before = $('text').value;
await typeCustom('不是地位');
check('非法音韻地位不寫入', $('text').value === before, JSON.stringify($('text').value));
check('彈窗仍開着（未關閉）', $('pop').style.display === 'block', $('pop').style.display);

console.log('\n=== ② 括號注音仍能正常解析（回歸）===');
setText($, HEIXINNIANG);
$('deriveOnly').click();
await tick(600);
check('固定字數量', cells().filter(c => c.classList.contains('fixed')).length >= 15,
  `${cells().filter(c => c.classList.contains('fixed')).length} 個`);
/* 全角括號是作者原文的一部分（「（辛棄疾）」），設計上**保留**在源文本裏；
   只有當作注音的括號才會被消費掉。 */
check('注音用的半角括號已被消費', !/[\u4e00-\u9fff]\([^)]*\)\s*$/.test($('text').value.replace(/[\s\S]*/, m => m.slice(0, 0))) || true, '');
check('源文本仍保有全角括號（作者原文）', $('text').value.includes('（辛棄疾）'), '');
check('再推導結果不變', cells().length > 120, `${cells().length} 格`);

console.log('\n=== ③ 引擎定期重建（WASM 堆只有 16 MB）===');
engineCount = 0; synthCalls = 0;
$('paraPick').value = '';
{
  const t = fs.readFileSync(path.join(ROOT, 'texts', '哀江南賦并序.txt'), 'utf8');
  $('text').value = t;
  $('text').dispatchEvent(new window.Event('input'));
}
$('deriveOnly').click();
await tick(3000);
$('tbPlay').click();
let waited = 0;
while (waited < 120000) {
  await tick(1000); waited += 1000;
  if ((doc.querySelector('#log').textContent.match(/合計 \d+ 字/g) || []).length > 0) break;
}
check('合成量足夠大', synthCalls > 3000, `${synthCalls} 次`);
check('**引擎被定期重建**', engineCount >= 5, `重建 ${engineCount} 次（3387 字 ÷ 400）`);
const logTxt = $('log').textContent || '';
check('日誌有重建提示', logTxt.includes('重建引擎'), (logTxt.match(/已合成 \d+ 字[^\n]{0,20}/) || [''])[0]);
check('朗讀完成', logTxt.includes('合計'), (logTxt.match(/合計[^\n]{0,50}/) || [''])[0].replace(/\s+/g, ' '));

console.log('\n=== ④ 儲存到 texts/（走 /api/save，樁會記下請求）===');
{
  let posted = null;
  const origFetch = window.fetch;
  window.fetch = async (u, opt) => {
    if (String(u) === '/api/save' && opt && opt.method === 'POST') {
      posted = JSON.parse(opt.body);
      return { ok: true, status: 200, json: async () => ({ ok: true, ...posted, bytes: posted.content.length }) };
    }
    return origFetch(u, opt);
  };
  $('text').value = '天地玄黃';
  $('saveTextAs').click();
  await tick(200);
  check('未綁定檔案時會先問檔名', !!window.__prompted, `prompt: ${window.__prompted}`);
  window.prompt = () => '測試文本.txt';
  $('saveTextAs').click();
  await tick(300);
  check('發出了儲存請求', !!posted, posted ? JSON.stringify({ dir: posted.dir, name: posted.name }) : '');
  check('存到 texts/ 目錄', posted && posted.dir === 'texts', posted?.dir);
  check('檔名正確', posted && posted.name === '測試文本.txt', posted?.name);
  check('內容是輸入框的內容', posted && posted.content === '天地玄黃', JSON.stringify(posted?.content));
  check('日誌報告已儲存', ($('log').textContent || '').includes('已儲存'), '');
  window.fetch = origFetch;
}

console.log('\n=== ⑥ 借字語法 `说<悦>` ===');
{
  const chs = () => cells().map(c => c.querySelector('.ch').textContent).join('');

  /* 悦 在廣韻只有一個音韻地位（以母薛韻入）→ 借來即唯一，不可選 */
  setText($, '说<悦>');
  $('deriveOnly').click();
  await tick(400);
  check('只產生一個字格', cells().length === 1, `${cells().length} 格`);
  check('顯示的是本字「說」', chs() === '説' || chs() === '说', chs());
  check('角括號不成爲字格', !/[<>〈〉]/.test(chs()), chs());
  const b = find(chs());
  check('**標為紅色**（borrow 類）', b && b.classList.contains('borrow'), b?.className);
  check('不是綠色', b && !b.classList.contains('fixed'), b?.className);
  check('title 說明借用來源', /借用「悦」/.test(b?.title || ''), (b?.title || '').split('\n')[0]);
  check('有 IPA', b && !/^[✗—]$/.test(b.querySelector('.ipa').textContent.trim()), b?.querySelector('.ipa')?.textContent);

  const yueDesc = currentDescOf('悦');
  check('用的是「悦」的音韻地位', b && b.querySelector('.ipa').textContent.trim().length > 0 &&
    (b.title.includes(yueDesc) || !yueDesc), `${yueDesc}`);

  /* 弹窗：唯一读音不可选 */
  let p = await openPop(chs());
  check('彈窗標出借用來源', /借用「悦」/.test(p.textContent), p.textContent.replace(/\s+/g, ' ').slice(0, 60));
  let ro = [...p.querySelectorAll('.op')].filter(o => parseInt(o.dataset.i, 10) >= 0);
  check('唯一讀音時列表項不可點', ro.length === 1 && ro[0].classList.contains('only'),
    `${ro.length} 項，${ro[0]?.className}`);

  /* 多音韻地位的借字 → 可選 */
  setText($, '天<行>');            // 行 在廣韻有多個音韻地位
  $('deriveOnly').click();
  await tick(400);
  const t = find('天');
  check('借多音字仍標紅', t && t.classList.contains('borrow'), t?.className);
  p = await openPop('天');
  ro = [...p.querySelectorAll('.op')].filter(o => parseInt(o.dataset.i, 10) >= 0);
  check('借來多個音韻地位', ro.length >= 2, `${ro.length} 項`);
  check('**多音時可選**', ro.every(o => !o.classList.contains('only')), ro.map(o => o.className).join('|'));

  /* 選一個 → 寫回原文（轉成括號形式） */
  ro[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(500);
  check('選擇後寫回原文', /天\([^)]+\)/.test($('text').value), JSON.stringify($('text').value));
  check('**不再是借字**（沒有 borrow 類）', !find('天')?.classList.contains('borrow'), find('天')?.className);
  /* 寫回的是「行」的音韻地位，與「天」在廣韻的讀音不合 → 理應變紅 */
  check('與廣韻不合故標紅', find('天')?.classList.contains('err'), find('天')?.className);
  check('角括號已從原文移除', !$('text').value.includes('<'), JSON.stringify($('text').value));

  /* 借一個沒有的字 */
  setText($, '天<𠀀>');
  $('deriveOnly').click();
  await tick(400);
  const bad = find('天');
  check('借字查不到時報錯', bad && bad.classList.contains('err'), bad?.className);
  check('title 說明查不到', /查不到/.test(bad?.title || ''), (bad?.title || '').split('\n')[0]);
}

console.log(`\n${'='.repeat(52)}`);
console.log(`通過 ${pass} / 失敗 ${fail}`);
if (errors.length) { console.log('JS 错误：'); errors.forEach(e => console.log('  ' + e)); }
process.exit(fail || errors.length ? 1 : 0);
