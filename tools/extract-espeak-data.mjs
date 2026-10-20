/*
 * extract-espeak-data.mjs — 从 worker.js 取文件表，从 .data 抽出 espeak 数据文件
 *
 * 结论（已在 probe-js-metadata 里验证）：
 *   worker.js 内嵌一份 JSON 文件表 [{filename,start,end}…]，
 *   .data 就是这些文件的裸拼接。所以**音素数据是独立文件**，
 *   打补丁不需要碰 wasm。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = fs.readFileSync(path.join(ROOT, 'engine', 'espeakng.worker.js'), 'utf8');
const data = fs.readFileSync(path.join(ROOT, 'engine', 'espeakng.worker.data'));

/* 文件表：找形如 [{"filename":"/…","start":N,"end":M}, …] 的最大一段 */
let table = null;
for (const m of js.matchAll(/\[\{"filename":[\s\S]{0,200000}?\}\]/g)) {
  try {
    const t = JSON.parse(m[0]);
    if (!table || t.length > table.length) table = t;
  } catch (e) { /* 截断的候选，跳过 */ }
}
if (!table) { console.log('✗ 找不到文件表'); process.exit(1); }
console.log(`文件表：${table.length} 项`);

const OUT = path.join(ROOT, 'reference', 'espeak-fs');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, '_filetable.json'), JSON.stringify(table, null, 1), 'utf8');

console.log('\n=== 最大的 20 个文件 ===');
const big = [...table].sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, 20);
for (const f of big) {
  console.log(`  ${String(f.end - f.start).padStart(9)}  ${f.filename}`);
}

console.log('\n=== 音素相關的關鍵文件 ===');
const KEY = ['phondata', 'phonindex', 'phontab', 'intonations', 'en_dict', 'phonemes'];
for (const k of KEY) {
  const f = table.find(x => x.filename.endsWith('/' + k));
  if (!f) { console.log(`  ✗ ${k}`); continue; }
  const b = data.subarray(f.start, f.end);
  fs.writeFileSync(path.join(OUT, k), b);
  console.log(`  ✓ ${k.padEnd(14)} ${String(b.length).padStart(9)} 位元組  @${f.start}  頭: ${[...b.subarray(0, 12)].map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
}

/* 統計 */
console.log('\n=== .data 佈局 ===');
const sorted = [...table].sort((a, b) => a.start - b.start);
console.log(`  首個文件 @${sorted[0].start}  ${sorted[0].filename}`);
console.log(`  末個文件結束 @${sorted[sorted.length - 1].end}  （.data 共 ${data.length} 位元組）`);
let gap = 0;
for (let i = 1; i < sorted.length; i++) if (sorted[i].start > sorted[i - 1].end) gap += sorted[i].start - sorted[i - 1].end;
console.log(`  文件之間的間隙合計 ${gap} 位元組`);
console.log(`  合計佔用 ${sorted.reduce((a, f) => a + (f.end - f.start), 0)} 位元組`);

/* 目錄分佈 */
console.log('\n=== 目錄分佈 ===');
const dirs = {};
for (const f of table) {
  const d = f.filename.replace(/\/[^/]*$/, '');
  dirs[d] = (dirs[d] || 0) + 1;
}
Object.entries(dirs).sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([d, n]) => console.log(`  ${String(n).padStart(5)}  ${d}`));
