/*
 * extract-wasm-table.mjs — 导出 WASM 里那张 20902 行的主字表
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* 路徑：站點原始文件統一放在 site-source/ 下 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site-source');
const WASM = path.join(SITE, 'duyin-web_bg.wasm');

const ws = SITE;
const out = path.join(ROOT, 'reference');
fs.mkdirSync(out, { recursive: true });

const buf = fs.readFileSync(WASM);

const START = 22339986;
/* 找标题行位置，取其前为数据 */
const latin = buf.toString('latin1');
const hIdx = latin.indexOf('("unicode","mc","pu","ct","sh","mn","kr","vn","jp_go"', START);
console.log(`标题行偏移 @${hIdx}`);
const COLS = ['unicode', 'mc', 'pu', 'ct', 'sh', 'mn', 'kr', 'vn', 'jp_go', 'jp_kan', 'jp_tou', 'jp_kwan', 'jp_other'];
console.log(`列：${COLS.join(', ')}\n`);

/* 数据区：START .. 标题行的引号前 */
let dataEnd = hIdx;
while (dataEnd > START && /[\s"]/.test(latin[dataEnd - 1])) dataEnd--;
const text = buf.subarray(START, dataEnd).toString('utf8');
const lines = text.split('\r\n').filter(l => /^"[0-9A-F]{4,6}"/.test(l));
console.log(`数据行 ${lines.length} 行`);

/* 解析 */
const table = {};
let okRows = 0;
for (const line of lines) {
  const fields = line.match(/"([^"]*)"/g);
  if (!fields || fields.length < 2) continue;
  const vals = fields.map(f => f.slice(1, -1));
  const cp = parseInt(vals[0], 16);
  if (!Number.isFinite(cp)) continue;
  const ch = String.fromCodePoint(cp);
  const rec = {};
  for (let i = 1; i < COLS.length; i++) {
    const v = vals[i] ?? '';
    if (v) rec[COLS[i]] = v;
  }
  if (Object.keys(rec).length) { table[ch] = rec; okRows++; }
}
console.log(`有效 ${okRows} 字\n`);

/* 统计每个音系的覆盖 */
console.log('音系     有读音的字数');
for (const c of COLS.slice(1)) {
  console.log(`  ${c.padEnd(9)} ${Object.values(table).filter(r => r[c]).length}`);
}

/* 抽查 */
console.log('\n=== 抽查 ===');
for (const ch of '天地玄黃宇宙洪荒日月盈昃列令行一二三四五六七八九十'.slice(0, 20)) {
  const r = table[ch];
  if (r) console.log(`  ${ch}  ${Object.entries(r).map(([k, v]) => k + '=' + v).join('  ')}`);
}

fs.writeFileSync(path.join(out, 'site-main-table.json'), JSON.stringify(table, null, 0), 'utf8');
console.log(`\n已写出 reference/site-main-table.json（${(fs.statSync(path.join(out, 'site-main-table.json')).size / 1048576).toFixed(2)} MB）`);
