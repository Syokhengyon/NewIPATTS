/*
 * check-deriver-api.mjs — 探明推導器可用的變數與呼叫形式
 *
 * 使用者那份推導器用了 `字頭` 這個自由變數，而本包只傳了 `音韻地位`。
 * 這裡確認：(1) 需要傳哪些變數 (2) 屬於() 是否支持標籤模板調用 (3) 調整() 的用法
 */
import fs from 'node:fs';
import { SAMPLE_DERIVER } from './fixtures.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
new Function(fs.readFileSync(path.join(ROOT, 'node_modules', 'tshet-uinh', 'index.js'), 'utf8'))();
const T = globalThis.TshetUinh;

const pos = T.音韻地位.from描述('云合三B支平');
console.log('測試用音韻地位:', String(pos));

console.log('\n=== 1. 屬於() 的各種呼叫形式 ===');
const forms = [
  ['屬於("云母")', () => pos.屬於('云母')],
  ['屬於("云母 通攝 舒聲")', () => pos.屬於('云母 通攝 舒聲')],
  ['屬於`云母 通攝 舒聲`（標籤模板）', () => pos.屬於`云母 通攝 舒聲`],
  ['屬於(["云母 通攝 舒聲"])', () => pos.屬於(['云母 通攝 舒聲'])],
  ['屬於("云母", "通攝")', () => pos.屬於('云母', '通攝')],
];
for (const [label, fn] of forms) {
  try { console.log(`  ✓ ${label}  →  ${JSON.stringify(fn())}`); }
  catch (e) { console.log(`  ✗ ${label}  →  ${e.message.slice(0, 70)}`); }
}

console.log('\n=== 2. 調整() 的用法 ===');
const tries = [
  ['調整("匣母")', () => pos.調整('匣母')],
  ['調整("匣母", ["匣母三等"])', () => pos.調整('匣母', ['匣母三等'])],
  ['調整("脂韻 入聲", {韻:"真"})', () => pos.調整('脂韻 入聲', { 韻: '真' })],
];
for (const [label, fn] of tries) {
  try { const r = fn(); console.log(`  ✓ ${label}  →  ${r}  (type=${typeof r})`); }
  catch (e) { console.log(`  ✗ ${label}  →  ${e.message.slice(0, 70)}`); }
}

console.log('\n=== 3. 自由變數：音韻地位 / 字頭 ===');
const src1 = 'return typeof 字頭;';
try { console.log('  只傳 音韻地位 → 字頭 is', new Function('音韻地位', src1)(pos)); }
catch (e) { console.log('  只傳 音韻地位 →', e.message.slice(0, 60)); }
try { console.log('  傳 (音韻地位, 字頭) → 字頭 is', new Function('音韻地位', '字頭', src1)(pos, '為')); }
catch (e) { console.log('  傳兩個 →', e.message.slice(0, 60)); }

console.log('\n=== 4. 用使用者的推導器實測（補上 字頭）===');
const userSrc = SAMPLE_DERIVER;
for (const sig of [['音韻地位'], ['音韻地位', '字頭']]) {
  try {
    const fn = new Function(...sig, userSrc);
    const out = fn(pos, '為');
    console.log(`  簽名 (${sig.join(', ')}) → ${JSON.stringify(out)}`);
  } catch (e) {
    console.log(`  簽名 (${sig.join(', ')}) → ✗ ${e.message.slice(0, 80)}`);
  }
}

console.log('\n=== 5. 用正確簽名跑一批字 ===');
const fn = new Function('音韻地位', '字頭', userSrc);
function 描述串(raw) {
  const o = raw && raw.音韻地位 ? raw.音韻地位 : raw;
  return [o.母, o.呼, o.等, o.類, o.韻, o.聲].filter(v => v != null && v !== '').join('');
}
console.log('字  音韻地位       描述          IPA');
let ok = 0, bad = 0;
for (const ch of '天地玄黃宇宙洪荒日月盈昃人工島鼻不為兄橫') {
  const rows = T.資料.query字頭(ch) || [];
  if (!rows.length) { console.log(`  ${ch}  （查不到）`); bad++; continue; }
  const d = 描述串(rows[0]);
  try {
    const p = T.音韻地位.from描述(d);
    const ipa = fn(p, ch);
    console.log(`  ${ch}  ${d.padEnd(13)} ${String(p.描述 || '').padEnd(11)} ${ipa}`);
    ok++;
  } catch (e) {
    console.log(`  ${ch}  ${d.padEnd(13)} ✗ ${e.message.slice(0, 50)}`);
    bad++;
  }
}
console.log(`\n成功 ${ok} / 失敗 ${bad}`);
