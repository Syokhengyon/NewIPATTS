/*
 * test-page-clicks.mjs — 在 jsdom 里真的点按钮，验证端到端流程
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'web', 'derive.html'), 'utf8');

const errors = [], warns = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail?.message || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));
vc.on('warn', (...a) => { if (!/^\[runDeriver\]/.test(String(a[0]))) return;
  try { warns.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')); } catch (e) {} });

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc, url: 'http://127.0.0.1:8981/' });
const { window } = dom;
const doc = window.document;

/* 补 API */
window.AudioContext = class { constructor() { this.state = 'running'; } resume() {} createBuffer() { return { copyToChannel() {} }; } createBufferSource() { return { connect() {}, start() {}, stop() {} }; } };
window.Worker = class { constructor() {} postMessage() {} terminate() {} addEventListener() {} };
const fetchLog = [];
/* 照抄 tools/serve.mjs 的路由表 —— 否则桩的路径解析和真实服务器不一致，
   会把「服务器能取到」误判成 404。（这个坑我踩过一次。） */
const ROUTES = {
  '/': 'web/derive.html', '/derive': 'web/derive.html',
  '/ipa': 'web/index.html', '/chart': 'web/chart.html',
  '/vendor/tshet-uinh.js': 'node_modules/tshet-uinh/index.js',
  '/vendor/deriver-tools.js': 'node_modules/tshet-uinh-deriver-tools/dist/index.js',
  '/derivers/__sample.js': 'tools/fixtures.mjs',
  '/derivers/__guanhua.txt': 'tools/fixtures.mjs',
};
window.fetch = async (u) => {
  const url = String(u).split('?')[0];
  const rel = ROUTES[url] ?? url.replace(/^\//, '');
  const p = path.join(ROOT, rel);
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
  const exists = fs.existsSync(p);
  const txt = exists ? fs.readFileSync(p, 'utf8') : '';
  fetchLog.push(`${url} -> ${exists ? txt.length + ' 字符' : '404 (' + rel + ')'}`);
  return { ok: exists, status: exists ? 200 : 404, text: async () => txt, json: async () => JSON.parse(txt || '{}') };
};
/* 引擎桩：合成回调给一段 1000 样本的非静音 */
window.eSpeakNG = class {
  constructor(url, cb) { this._cb = cb; setTimeout(() => cb && cb(), 0); }
  set_rate() {} set_pitch() {} set_voice() {} delete() {}
  synthesize(t, cb) {
    this.lastText = t;
    const buf = new Float32Array(2000);
    for (let i = 0; i < 1000; i++) { buf[i * 2] = Math.sin(i / 20) * 0.5; buf[i * 2 + 1] = buf[i * 2]; }
    setTimeout(() => { cb(buf); cb(null); }, 0);
  }
};
window.URL.createObjectURL = () => 'blob:x';
window.navigator.clipboard = { writeText: async () => {} };

/* 装依赖 */
for (const f of ['node_modules/tshet-uinh/index.js', 'node_modules/tshet-uinh-deriver-tools/dist/index.js']) {
  try { window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { errors.push(`装 ${f}: ${e.message}`); }
}

/* 装页面 module */
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
try { window.eval(src); } catch (e) { errors.push('module 求值: ' + e.message); }

/* 触发 load */
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
window.dispatchEvent(new window.Event('load'));
const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));
await tick(400);

const $ = id => doc.getElementById(id);
const logText = () => ($('log')?.textContent || '').replace(/\s+/g, ' ');
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  ' + extra : ''}`); }
};

console.log('=== 启动状态 ===');
check('无 JS 错误', errors.length === 0, errors.join(' | '));
check('示例方案自动载入', logText().includes('推導方案已載入'), '');
check('按钮全部绑定', [...doc.querySelectorAll('button[id]')].every(b => b.onclick), '');

console.log('\n=== ① 「推導」按钮 ===');
$('text').value = '天地玄黃宇宙洪荒';
$('deriveOnly').click();
await tick(200);
const cells = [...doc.querySelectorAll('#canvas .cell')];
check('生成字格', cells.length === 8, `${cells.length} 个`);
check('每格有 IPA', cells.every(c => /[a-zɑ-ʯ]/.test(c.querySelector('.ipa')?.textContent || '')),
  cells.slice(0, 3).map(c => c.querySelector('.ipa')?.textContent).join(' | '));
if (cells[0] && !/[a-zɑ-ʯ]/.test(cells[0].querySelector('.ipa')?.textContent || '')) {
  console.log('     诊断：格子 title = ' + JSON.stringify(cells[0].title));
  console.log('     诊断：日誌 = ' + logText().slice(-300));
}
check('天 → tʰe53', cells[0]?.querySelector('.ipa')?.textContent.includes('tʰe53'), cells[0]?.querySelector('.ipa')?.textContent);
check('字显示正确', cells.map(c => c.querySelector('.ch')?.textContent).join('') === '天地玄黃宇宙洪荒');
check('统计信息', ($('resInfo')?.textContent || '').includes('8 字'), $('resInfo')?.textContent);

console.log('\n=== ② 多音字（蓝色 + 可点） ===');
$('text').value = '列令行天';
$('deriveOnly').click();
await tick(200);
const cs = [...doc.querySelectorAll('#canvas .cell')];
if (!cs.length) {
  console.log('  ⚠ 没有生成任何字格 —— 提前结束并打印诊断');
  console.log('\n=== fetch 记录 ==='); fetchLog.forEach(l => console.log('  ' + l));
  console.log('\n=== 页面日志 ===\n  ' + logText());
  console.log('\n=== scriptStatus ===\n  ' + ($('scriptStatus')?.textContent || ''));
  console.log('\n=== #script 长度 ===\n  ' + $('script').value.length);
  if (warns.length) { console.log('\n=== runDeriver 诊断 ==='); warns.slice(0, 2).forEach(w => console.log('  ' + w)); }
  process.exit(1);
}
check('「列」标为多音字', cs[0]?.classList.contains('multi'), cs[0]?.className);
check('「令」标为多音字', cs[1]?.classList.contains('multi'));
check('「行」标为多音字', cs[2]?.classList.contains('multi'));
check('「天」非多音字', !cs[3]?.classList.contains('multi'));
check('多音字有角标', !!cs[0]?.querySelector('.badge'), cs[0]?.querySelector('.badge')?.textContent + ' 个读音');
/* 点多音字 → 弹窗 */
cs[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(100);
const pop = $('pop');
check('弹窗打开', pop.style.display === 'block');
const ops = [...pop.querySelectorAll('.op')];
check('弹窗列出读音', ops.length >= 2, `${ops.length} 项`);
check('弹窗含「试听全部」', ops.some(o => o.textContent.includes('試聽全部')));
check('弹窗显示音韻地位', pop.textContent.includes('知合三虞平') && pop.textContent.includes('來開三仙入'), '');
/* 选第二个读音 —— 现在的行为是**写回源文本**（在字后插括号），不是只记 localStorage */
$('text').value = '列令行天';
$('deriveOnly').click();
await tick(200);
const cs0 = [...doc.querySelectorAll('#canvas .cell')];
cs0[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(100);
const pop0 = $('pop');
const ops0 = [...pop0.querySelectorAll('.op')];
ops0[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick(400);
check('選讀音後寫回源文本', $('text').value.includes('列(來開三仙入)'), JSON.stringify($('text').value.slice(0, 24)));
const cs2 = [...doc.querySelectorAll('#canvas .cell')];
check('切换读音生效', cs2[0]?.querySelector('.ipa')?.textContent.includes('li2'), cs2[0]?.querySelector('.ipa')?.textContent);
check('該字變成綠色（已固定）', cs2[0]?.classList.contains('fixed'), cs2[0]?.className);
check('不再是多音字', !cs2[0]?.classList.contains('multi'), cs2[0]?.className);
check('角標消失', !cs2[0]?.querySelector('.badge'));

console.log('\n=== ③ 「自檢」按钮 ===');
$('selfTest').click();
await tick(200);
const lt = logText();
check('自检输出标题', lt.includes('推導方案自檢'));
check('自检列出四变量', lt.includes('TshetUinh / 選項 / 音韻地位 / 字頭'));
check('自检有成功项', /成功 \d+/.test(lt), (lt.match(/成功 \d+ \/ 失敗 \d+/) || [''])[0]);

console.log('\n=== ④ 「清空」按钮 ===');
$('clearText').click();
await tick(100);
check('输入框清空', $('text').value === '');
check('结果区清空', doc.querySelectorAll('#canvas .cell').length === 0);

console.log('\n=== ⑤ 資料夾下拉框與儲存按鈕 ===');
check('texts/ 下拉框存在且已綁定', !!$('textPick') && typeof $('textPick').onchange === 'function');
check('derivers/ 下拉框存在且已綁定', !!$('deriverPick') && typeof $('deriverPick').onchange === 'function');
check('「儲存」「另存新檔」已綁定',
  !!$('saveText').onclick && !!$('saveTextAs').onclick &&
  !!$('saveDeriver').onclick && !!$('saveDeriverAs').onclick);
/* 下拉框內容來自 /api/，樁會回我們自己的方案 */
check('derivers/ 下拉框有選項', $('deriverPick').options.length >= 2,
  [...$('deriverPick').options].map(o => o.textContent).join(' '));
check('檔案綁定提示存在', /未綁定|已綁定/.test($('textFile').textContent), $('textFile').textContent);
/* 「插模板」不依賴 derivers/ 裡的檔案 */
$('loadEx').click();
await tick(150);
check('「插模板」載入內建模板', $('script').value.includes('音韻地位') && $('script').value.length > 200,
  `${$('script').value.length} 字元`);
check('插模板後仍是未綁定狀態', /未綁定/.test($('deriverFile').textContent), $('deriverFile').textContent);

console.log('\n=== ⑥ 手动贴入方案 ===');
$('script').value = `if (!音韻地位) return [['前綴','X']];
return 選項.前綴 + 音韻地位.描述;`;
$('script').dispatchEvent(new window.Event('input'));
await tick(200);
check('脚本被接受', ($('scriptStatus')?.textContent || '').includes('已載入'), $('scriptStatus')?.textContent);
check('设定项渲染出来', ($('options')?.textContent || '').includes('前綴'), $('options')?.textContent?.slice(0, 60));
$('text').value = '天';
$('deriveOnly').click();
await tick(200);
const c2 = [...doc.querySelectorAll('#canvas .cell')];
check('用新方案推導', c2[0]?.querySelector('.ipa')?.textContent.includes('X透開四先平'), c2[0]?.querySelector('.ipa')?.textContent);

console.log('\n=== ⑦ 显示开关 ===');
/* 先换回示例方案 —— 上一段的内联方案返回的是描述串，没有音素可显示 */
$('loadEx').click();
await tick(300);
$('text').value = '天地';
$('deriveOnly').click();
await tick(150);
check('回到內建模板', doc.querySelector('#canvas .cell .ipa')?.textContent.includes('tʰe'), doc.querySelector('#canvas .cell .ipa')?.textContent);
$('showPhon').checked = true; $('showPhon').dispatchEvent(new window.Event('change'));
await tick(100);
/* 音素名是分段显示的（tʰe → 'th e'），断言要去掉空格再比对 */
const ipaTxt = doc.querySelector('#canvas .cell .ipa')?.textContent || '';
check('显示音素名', ipaTxt.replace(/\s/g, '').includes('the'), ipaTxt);
$('showIpa').checked = false; $('showIpa').dispatchEvent(new window.Event('change'));
await tick(100);
check('隐藏标音后不再显示 IPA', !(doc.querySelector('#canvas .cell .ipa')?.textContent || '').includes('tʰe'),
  doc.querySelector('#canvas .cell .ipa')?.textContent);
/* 只显示失败的字 */
$('showIpa').checked = true; $('showIpa').dispatchEvent(new window.Event('change'));
$('text').value = '天𠀀';                       // 𠀀 是扩展区字，廣韻查不到，应只留它
$('deriveOnly').click();
await tick(150);
$('hideUnknown').checked = true; $('hideUnknown').dispatchEvent(new window.Event('change'));
await tick(100);
const kept = [...doc.querySelectorAll('#canvas .cell .ch')].map(c => c.textContent);
check('只顯示失敗的字', kept.length === 1 && kept[0] !== '天', kept.join(''));

console.log(`\n${'='.repeat(50)}`);
console.log(`通過 ${pass} / 失敗 ${fail}`);
if (errors.length) { console.log('\nJS 错误：'); errors.forEach(e => console.log('  ' + e)); }
if (warns.length) { console.log('\n=== runDeriver 诊断 ==='); warns.slice(0, 2).forEach(w => console.log('  ' + w)); }
console.log('\n=== fetch 记录 ==='); fetchLog.forEach(l => console.log('  ' + l));
console.log('\n=== 页面日志（尾部）===\n  ' + logText().slice(-350));
process.exit(fail || errors.length ? 1 : 0);
