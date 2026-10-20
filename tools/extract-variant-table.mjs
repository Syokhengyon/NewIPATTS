/*
 * extract-variant-table.mjs — 提取 WASM 里的異體字/簡繁表
 *
 * 格式：每行 5 个逗号分隔字段，字段内可含多个字。
 *   国,,,,國        漢,,,汉,
 *   國,圀囯,,国,     語,,,语,
 * 同组即互为異體（含简繁关系）。站点用它做两件事：
 *   · 简化字 → 繁体（才能在廣韻里查到）
 *   · 廣韻查不到的字 → 找同组的字類推
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* 路徑：站點原始文件統一放在 site-source/ 下 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site-source');
const WASM = path.join(SITE, 'duyin-web_bg.wasm');

const buf = fs.readFileSync(WASM);
const utf8 = buf.toString('utf8');

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const lines = utf8.split('\r\n');
console.log(`共 ${lines.length} 行`);

const groups = [];
for (const line of lines) {
  const p = line.split(',');
  if (p.length !== 5) continue;
  /* 第一格必须恰好一个字；其余格只能含汉字或为空 */
  if ([...p[0]].length !== 1 || !CJK.test(p[0])) continue;
  let bad = false;
  for (let i = 1; i < 5; i++) {
    for (const c of p[i]) if (!CJK.test(c)) { bad = true; break; }
    if (bad) break;
  }
  if (bad) continue;
  groups.push(p);
}
console.log(`命中 ${groups.length} 行`);

/* 建并查集：同行的字互为一组 */
const parent = new Map();
const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
for (const p of groups) {
  const all = [];
  for (const f of p) for (const c of f) if (CJK.test(c)) all.push(c);
  for (const c of all) if (!parent.has(c)) parent.set(c, c);
  for (let i = 1; i < all.length; i++) union(all[0], all[i]);
}
const byRoot = new Map();
for (const c of parent.keys()) {
  const r = find(c);
  if (!byRoot.has(r)) byRoot.set(r, []);
  byRoot.get(r).push(c);
}
const multi = [...byRoot.values()].filter(g => g.length > 1);
console.log(`并查集：${byRoot.size} 组，其中多字组 ${multi.length} 组，涉及 ${multi.reduce((a, g) => a + g.length, 0)} 字`);

/* 导出：字 → 同组其他字（去重） */
const map = {};
for (const g of multi) for (const c of g) map[c] = g.filter(x => x !== c);
console.log(`导出 ${Object.keys(map).length} 字`);

console.log('\n=== 验证 ===');
for (const ch of ['国', '汉', '语', '简', '们', '这', '为', '发', '头', '东', '见', '说', '窗', '窻', '你', '的', '体']) {
  console.log(`  ${ch} → ${map[ch] ? map[ch].join(' ') : '—'}`);
}

/* 关键：简化字能否借此找到廣韻里的繁体 */
new Function(fs.readFileSync(path.join(ROOT, 'node_modules', 'tshet-uinh', 'index.js'), 'utf8'))();
const T = globalThis.TshetUinh;
const FB = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference', 'site-fallback-table.json'), 'utf8'));
const gw = ch => (T.資料.query字頭(ch) || []).length > 0;

console.log('\n=== 简化字 → 同组里能查到的字 ===');
let okN = 0, noN = 0;
for (const [s, t] of [['国', '國'], ['汉', '漢'], ['语', '語'], ['简', '簡'], ['东', '東'], ['见', '見'], ['头', '頭'], ['为', '爲'], ['们', '們'], ['这', '這'], ['发', '發'], ['说', '説']]) {
  const grp = (map[s] || []).filter(c => gw(c) || FB[c]);
  const direct = gw(s) || FB[s];
  if (grp.length || direct) okN++; else noN++;
  console.log(`  ${s}  直接: ${direct ? '有' : '—'}   同组可用: ${grp.join(' ') || '—'}`);
}
console.log(`  可解 ${okN} / 不可解 ${noN}`);

const out = path.join(ROOT, 'reference', 'site-variant-table.json');
fs.writeFileSync(out, JSON.stringify(map), 'utf8');
console.log(`\n已写出 reference/site-variant-table.json（${(fs.statSync(out).size / 1024).toFixed(0)} KB）`);
