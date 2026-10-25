/*
 * verify-derive-page.mjs — 完整验证 derive.html 的全部逻辑
 *
 * 模拟浏览器环境（tshet-uinh UMD + deriver-tools UMD），
 * 逐项复现页面里的函数，跑两套方案（示例切韻 / 官話島）验证。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_DERIVER } from './fixtures.mjs';
import { prepareBody, toEspeak, segmentPhonemes } from '../src/ipa-espeak.mjs';
import { splitTone } from '../src/tones.mjs';
import { trimSilence, mergeWithGap } from '../src/audio.mjs';
import { Speaker } from '../src/speak.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SR = 22050;
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? '  ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  ' + extra : ''}`); }
};

/* ---------- 浏览器式加载 ---------- */
new Function(fs.readFileSync(path.join(ROOT, 'node_modules', 'tshet-uinh', 'index.js'), 'utf8'))();
new Function(fs.readFileSync(path.join(ROOT, 'node_modules', 'tshet-uinh-deriver-tools', 'dist', 'index.js'), 'utf8'))();
const T = globalThis.TshetUinh;
const DT = globalThis.TshetUinhDeriverTools;

console.log('=== 0. 依赖加载 ===');
ok('TshetUinh 可用', !!T, Object.keys(T || {}).join(' '));
ok('TshetUinhDeriverTools 可用', !!DT, Object.keys(DT || {}).join(' '));

/* ---------- 页面里的同名函数 ---------- */
function makeRawFn(source) {
  return new Function('TshetUinh', '選項', '音韻地位', '字頭', source).bind(undefined, T);
}
function compileDeriver(source) {
  const fn = makeRawFn(source);
  return (pos, 字頭 = null, 選項 = {}) => {
    const r = fn(選項, pos, 字頭);
    if (Array.isArray(r)) return '';
    return String(r == null ? '' : r);
  };
}
function renderOptionList(source, opts = {}) {
  const raw = makeRawFn(source)(opts, null, null);
  if (DT && DT.推導設定 && Array.isArray(raw)) {
    const 設定 = new DT.推導設定(raw);
    return { 列表: 設定.列表, 錯誤: 設定.解析錯誤 };
  }
  return { 列表: (Array.isArray(raw) ? raw : []).filter(x => Array.isArray(x) && x.length >= 2).map(([key, value]) => ({ key, value })), 錯誤: [] };
}
function 描述串(raw) {
  const o = raw && raw.音韻地位 ? raw.音韻地位 : raw;
  if (!o) return '';
  return [o.母, o.呼, o.等, o.類, o.韻, o.聲].filter(v => v != null && v !== '').join('');
}
function deriveAll(text, deriver, opts = {}, picks = {}) {
  const out = [];
  for (const ch of text) {
    if (ch === '\n') { out.push({ br: true }); continue; }
    if (/\s/.test(ch)) continue;
    const raw = T.資料.query字頭(ch) || [];
    if (!raw.length) { out.push({ 字: ch, readings: [], err: '廣韻查不到此字' }); continue; }
    const readings = [];
    for (const r of raw) {
      const d = 描述串(r);
      let pos = null;
      try { pos = T.音韻地位.from描述(d); } catch (e) {}
      if (!pos) continue;
      let ipa = '', err = '';
      try { ipa = deriver(pos, ch, opts); } catch (e) { err = '推導異常：' + e.message; }
      readings.push({ 描述: d, 反切: r.反切, ipa, err });
    }
    if (!readings.length) { out.push({ 字: ch, readings: [], err: '無法建構音韻地位' }); continue; }
    out.push({ 字: ch, readings, pick: picks[ch] ?? 0 });
  }
  return out;
}
const cur = row => row.readings.length ? row.readings[Math.min(row.pick ?? 0, row.readings.length - 1)] : null;
function espOf(ipa, zeroMode = 'glottal') {
  const { body, tone } = splitTone(ipa);
  const prep = prepareBody(body, zeroMode);
  return { esp: prep.text + tone, tone, prep };
}
function rateForTone(tone, rate, factor, on = true) {
  if (!on || tone.length < 3) return rate;
  return factor === 1 ? rate : Math.max(60, Math.round(rate * factor));
}

/* ---------- 1. 内建推導方案 ---------- */
console.log('\n=== 1. 内建推導方案 ===');
const exSrc = SAMPLE_DERIVER;
const d1 = compileDeriver(exSrc);
ok('編譯成功', typeof d1 === 'function');
{
  const o = renderOptionList(exSrc);
  ok('設定項讀取', Array.isArray(o.列表), `${o.列表.length} 項，錯誤 ${o.錯誤.length}`);
}
{
  const rows = deriveAll('天地玄黃宇宙洪荒日月盈昃', d1);
  const good = rows.filter(r => cur(r) && cur(r).ipa).length;
  ok('推導 12 字', good === 12, `${good}/12`);
  const first = cur(rows[0]);
  ok('天 → tʰe53', first.ipa === 'tʰe53', first.ipa);
  /* 多音字 */
  const lie = deriveAll('列', d1)[0];
  ok('「列」有多個讀音', lie.readings.length === 2, lie.readings.map(r => r.描述).join(' / '));
  ok('「列」[0] 是訛字條目', lie.readings[0].描述 === '知合三虞平', lie.readings[0].描述);
  ok('「列」[1] 是正常音', lie.readings[1].描述 === '來開三仙入', lie.readings[1].ipa);
}

/* ---------- 2. 内建方案（選項分支） ---------- */
/*
 * 這裡原本驗的是某份具體方案的音值（含 字頭 例外）。
 * 那份方案是放在 derivers/ 裡的檔案，屬於**使用者自己的地盤**，
 * 內容隨時會改 —— 測試不該綁在那上面。
 * 改成驗「機制」：四個自由變數可用、選項開關真的改變輸出、
 * 韻母按等區分、聲調按聲區分。音值本身由 verify-table 與人耳負責。
 */
console.log('\n=== 2. 内建方案（選項分支）===');
const ghSrc = SAMPLE_DERIVER;
const d2 = compileDeriver(ghSrc);
ok('編譯成功', typeof d2 === 'function');
{
  const o = renderOptionList(ghSrc);
  ok('設定項解析', o.列表.length >= 1, JSON.stringify(o.列表.map(x => x[0])));
}
{
  const pos = (s) => T.音韻地位.from描述(s);
  /* 設定項的形狀是 {key, value, ...}，不是 [key, value] */
  const op = renderOptionList(ghSrc).列表.reduce((a, it) => (a[it.key] = it.value, a), {});

  const 天 = d2(pos('透開四先平'), '天', op);
  const 同 = d2(pos('定一東平'), '同', op);
  ok('清濁有別（透 tʰ vs 定 d）', 天.startsWith('tʰ') && 同.startsWith('d'), `${天} / ${同}`);
  ok('合口帶 w（玄 ɣwe）', d2(pos('匣合四先平'), '玄', op).includes('w'), d2(pos('匣合四先平'), '玄', op));
  ok('聲調有別（平 53 vs 去 31）',
    d2(pos('透開四先平'), null, op).endsWith('53') && d2(pos('透開四先去'), null, op).endsWith('31'));
  ok('四等韻母各異',
    new Set(['透開一歌平', '徹開二麻平', '知開三支平', '端開四齊平']
      .map(s => d2(pos(s), null, op).replace(/\d+$/, ''))).size === 4);

  /* 選項真的改變輸出 */
  const 濁 = d2(pos('定一東平'), '同', { ...op, 濁音清化: true });
  ok('選項「濁音清化」生效', 濁.startsWith('t') && !濁.startsWith('d'), `d→${濁}`);
  ok('選項關閉時不變', d2(pos('定一東平'), '同', { ...op, 濁音清化: false }).startsWith('d'));

  /* 字頭是第四個自由變數 —— 傳了不該拋錯 */
  ok('字頭參數可用', typeof d2(pos('透開四先平'), '天', op) === 'string');
}

/* ---------- 3. 四变量都可用 ---------- */
console.log('\n=== 3. 推導器四個自由變數 ===');
{
  const SRC = `if (!音韻地位) return [['前綴','d'],['高級選項',false]]; return 選項.前綴+':'+字頭+':'+typeof TshetUinh+':'+音韻地位.描述;`;
  const f = compileDeriver(SRC);
  const out = f(T.音韻地位.from描述('幫三C凡入'), '凡', { 前綴: 'Z' });
  ok('TshetUinh / 選項 / 音韻地位 / 字頭 全可用', out === 'Z:凡:object:幫三C凡入', out);
  const o = renderOptionList(SRC);
  ok('設定項解析', o.列表.length === 2, JSON.stringify(o.列表));
}

/* ---------- 4. 枚舉型設定項 ---------- */
console.log('\n=== 4. 枚舉型設定項（下拉框） ===');
{
  const SRC = `
    if (!音韻地位) return [
      ['模式','標準',{text:'推導模式',options:[{value:'標準',text:'標準'},{value:'簡略',text:'簡略'}]}],
      ['大寫',false,{text:'轉大寫'}],
      ['層級',3,{text:'層級'}],
    ];
    const s = 選項.模式 === '簡略' ? 音韻地位.簡略描述 : 音韻地位.描述;
    return (選項.大寫 ? s.toUpperCase() : s) + '/' + 選項.層級;
  `;
  const f = compileDeriver(SRC);
  const pos = T.音韻地位.from描述('幫三C凡入');
  const o = renderOptionList(SRC);
  ok('設定項 3 項', o.列表.length === 3, o.列表.map(x => x.key).join(' '));
  const mode = o.列表.find(x => x.key === '模式');
  ok('模式是枚舉（有 options）', Array.isArray(mode.options) && mode.options.length === 2, JSON.stringify(mode.options));
  ok('有 text 顯示名', mode.text === '推導模式', mode.text);
  ok('默認值推導', f(pos, '凡', { 模式: '標準', 大寫: false, 層級: 3 }) === '幫三C凡入/3', f(pos, '凡', { 模式: '標準', 大寫: false, 層級: 3 }));
  ok('切換枚舉生效', f(pos, '凡', { 模式: '簡略', 大寫: false, 層級: 3 }) === '幫凡入/3', f(pos, '凡', { 模式: '簡略', 大寫: false, 層級: 3 }));
  ok('切換布爾生效', f(pos, '凡', { 模式: '標準', 大寫: true, 層級: 5 }).endsWith('/5'), f(pos, '凡', { 模式: '標準', 大寫: true, 層級: 5 }));
}

/* ---------- 5. 音素轉寫與聲調 ---------- */
console.log('\n=== 5. IPA → 音素名 / 聲調 ===');
{
  const cases = [
    ['tʰen⁵³', 'then', '53'],
    ['ɖɨw²¹²', 'd.i":w', '212'],   // ɨw 有音長補償（i" → i":w，見 OVERRIDES）
    ['ɣuɑŋ³¹', 'g"uaN', '31'],     // ɣ → g"；ɑ 現映射到 a（低元音重定後）
    ['ʈʂɨk⁵', 'ts.i"k', '5'],
    ['ɬa⁵³', 'l#A.', '53'],        // a 現映射到 A.
    ['bʱa⁵³', 'bh.A.', '53'],
    ['ɭiæŋ²⁴', 'l.i&N', '24'],
    ['ʕa⁵³', '?\\A.', '53'],
    ['ʏ⁵³', 'Y', '53'],
  ];
  for (const [ipa, wantEsp, wantTone] of cases) {
    const { esp, tone } = espOf(ipa, 'none');
    ok(`${ipa} → ${wantEsp}`, esp === wantEsp + wantTone, `得到 ${esp}`);
  }
  const z = espOf('a⁵³', 'glottal');
  ok('零聲母補償', z.esp === '?A.53', z.esp);
  const z0 = espOf('a⁵³', 'none');
  ok('零聲母可關', z0.esp === 'A.53', z0.esp);
}
{
  ok('三位調不降速', rateForTone('313', 140, 1, true) === 140);
  ok('三位調 ×0.6', rateForTone('313', 140, 0.6, true) === 84);
  ok('二位調不受影響', rateForTone('31', 140, 0.6, true) === 140);
}

/* ---------- 6. 音频拼接 ---------- */
console.log('\n=== 6. 靜音裁剪與拼接 ===');
{
  const sp = await Speaker.create({ zeroInitial: 'none' });
  sp.voice = 'ipa+wide80';
  const LINE = 'tʰen⁵³ ɖɨw²¹² ʈʂɨk⁵';
  const segs = [];
  const info = [];
  for (const ipa of LINE.split(' ')) {
    const { esp, tone } = espOf(ipa, 'none');
    const r = await sp._synthRaw(`[[ ${esp} _: ]]`, rateForTone(tone, 140, 1));
    const tr = trimSilence(r.samples, { sr: SR });
    info.push(`${r.n}→${tr.length}`);
    segs.push(tr);
  }
  const merged = mergeWithGap(segs, 45, SR);
  const rawTotal = info.reduce((a, s) => a + parseInt(s.split('→')[0]), 0);
  ok('裁剪有效', merged.length < rawTotal * 0.55, `${rawTotal} → ${merged.length}（${(merged.length / rawTotal * 100).toFixed(0)}%）`);
  ok('有聲（非全靜音）', merged.some(v => Math.abs(v) > 0.01));
  const dur = merged.length / SR;
  ok('時長合理（1-3 秒）', dur > 0.8 && dur < 3.5, `${dur.toFixed(2)}s`);
}

/* ---------- 7. 網頁引用的資源都存在 ---------- */
console.log('\n=== 7. 網頁資源 ===');
{
  const html = fs.readFileSync(path.join(ROOT, 'web', 'derive.html'), 'utf8');
  const ROUTES = {
    '/': 'web/derive.html', '/chart': 'web/chart.html', '/ipa': 'web/index.html',
    '/vendor/tshet-uinh.js': 'node_modules/tshet-uinh/index.js',
    '/vendor/deriver-tools.js': 'node_modules/tshet-uinh-deriver-tools/dist/index.js',
    '/derivers/__sample.js': 'tools/fixtures.mjs',
    '/engine/espeakng.js': 'engine/espeakng.js',
    '/engine/espeakng.worker.js': 'engine/espeakng.worker.js',
    '/engine/espeakng.worker.data': 'engine/espeakng.worker.data',
  };
  const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map(m => m[1]))];
  for (const r of refs) {
    const target = ROUTES[r] ?? r.slice(1);
    ok(`${r}`, fs.existsSync(path.join(ROOT, target)), `→ ${target}`);
  }
  /* import 语句 */
  const imps = [...html.matchAll(/import\s+\{[^}]+\}\s+from\s+'([^']+)'/g)].map(m => m[1]);
  for (const i of imps) ok(`import ${i}`, fs.existsSync(path.join(ROOT, i.slice(1))));
}

console.log(`\n${'='.repeat(50)}`);
console.log(`通過 ${pass} / 失敗 ${fail}`);
process.exit(fail ? 1 : 0);
