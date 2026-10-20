/*
 * check-multireading.mjs — 验证多音字逻辑（以「列」为案例）
 */
import fs from 'node:fs';
import { SAMPLE_DERIVER } from './fixtures.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
new Function(fs.readFileSync(path.join(ROOT, 'node_modules', 'tshet-uinh', 'index.js'), 'utf8'))();
const T = globalThis.TshetUinh;

function 描述串(raw) {
  const o = raw && raw.音韻地位 ? raw.音韻地位 : raw;
  if (!o) return '';
  return [o.母, o.呼, o.等, o.類, o.韻, o.聲].filter(v => v != null && v !== '').join('');
}
function compileDeriver(source) {
  const fn = new Function('音韻地位', source);
  return (pos) => { const r = fn(pos); return Array.isArray(r) ? '' : String(r == null ? '' : r); };
}
const deriver = compileDeriver(SAMPLE_DERIVER);

/* 页面里的 deriveAll 语义 */
function deriveAll(text) {
  const out = [];
  for (const ch of text) {
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
      try { ipa = deriver(pos); } catch (e) { err = '推導異常：' + e.message; }
      readings.push({ 描述: d, 反切: r.反切, 釋義: String(r.釋義 || '').slice(0, 24), ipa, err });
    }
    out.push({ 字: ch, readings, pick: 0 });
  }
  return out;
}

console.log('=== 多音字清單（測試串：列令行天為）===');
for (const row of deriveAll('列令行天為')) {
  console.log(`\n${row.字}  ${row.readings.length} 個讀音`);
  row.readings.forEach((r, i) => {
    const mark = i === 0 ? '★默认' : '     ';
    console.log(`  ${mark} [${i}] ${r.描述.padEnd(12)} 反切=${(r.反切 || '').padEnd(6)} ipa=${(r.ipa || r.err || '（空）').padEnd(12)} ${r.釋義}`);
  });
}

console.log('\n=== 檢查：默认选择是否合理 ===');
const BAD = [];
for (const row of deriveAll('列令行天為')) {
  const r0 = row.readings[0];
  const anyGood = row.readings.some(x => x.ipa);
  if (!r0 || !r0.ipa) {
    const firstOk = row.readings.findIndex(x => x.ipa);
    BAD.push([row.字, r0 ? r0.描述 : '(无)', firstOk]);
    console.log(`  ⚠ ${row.字} 默认 [0]=${r0 ? r0.描述 : '?'} 推導不出，第一個可用的是 [${firstOk}]`);
  } else {
    console.log(`  ✓ ${row.字} 默认 [0]=${r0.描述} → ${r0.ipa}`);
  }
}
if (BAD.length) {
  console.log(`\n  → 建議：若 [0] 推導為空，自動往後找第一個能推導的讀音`);
}

console.log('\n=== 檢查所有讀音的推導成功率 ===');
const all = deriveAll('列令行天為天地玄黃宇宙洪荒');
let tot = 0, okn = 0;
for (const row of all) for (const r of row.readings) { tot++; if (r.ipa) okn++; }
console.log(`  ${okn}/${tot} 個讀音推導成功`);
