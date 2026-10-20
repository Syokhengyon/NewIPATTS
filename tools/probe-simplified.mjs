/*
 * probe-simplified.mjs — 查站点/WASM 是否支持简化字
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* 路徑：站點原始文件統一放在 site-source/ 下 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site-source');
const WASM = path.join(SITE, 'duyin-web_bg.wasm');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const buf = fs.readFileSync(WASM);
const utf8 = buf.toString('utf8');

new Function(fs.readFileSync(path.join(ROOT, 'node_modules', 'tshet-uinh', 'index.js'), 'utf8'))();
const T = globalThis.TshetUinh;
const FB = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference', 'site-fallback-table.json'), 'utf8'));

const PAIRS = [
  ['国', '國'], ['汉', '漢'], ['语', '語'], ['简', '簡'], ['们', '們'], ['这', '這'],
  ['为', '爲'], ['发', '發'], ['头', '頭'], ['无', '無'], ['与', '與'], ['万', '萬'],
  ['东', '東'], ['风', '風'], ['龙', '龍'], ['书', '書'], ['学', '學'], ['见', '見'],
  ['说', '説'], ['时', '時'], ['来', '來'], ['会', '會'], ['后', '後'], ['里', '裏'],
];

const g = ch => (T.資料.query字頭(ch) || []).length;
const f = ch => FB[ch] ? FB[ch].map(x => x.描述).join('/') : '—';

console.log('简  繁   廣韻(简)  廣韻(繁)  補充(简)  補充(繁)');
for (const [s, t] of PAIRS) {
  console.log(`  ${s}   ${t}    ${(g(s) ? '有' : '—').padEnd(7)}  ${(g(t) ? '有' : '—').padEnd(7)}  ${f(s).padEnd(8)}  ${f(t)}`);
}

console.log('\n=== 補充表里有没有简化字 ===');
let simp = 0, trad = 0;
for (const ch of Object.keys(FB)) {
  /* 粗略判断：能 NFD/NFKC 后与繁体不同的就是简体候选，这里只看常见简化偏旁 */
  if (/[国汉语简们这为发头无与万东风龙书学见说时来会后里]/.test(ch)) simp++;
  else trad++;
}
console.log(`  含常见简化偏旁的 ${simp} 个，其余 ${trad} 个`);

console.log('\n=== WASM 里找簡繁对照表 ===');
/* 找形如「国國」或含「國」的短串 */
for (const ch of ['国', '汉', '语', '简']) {
  let from = 0, n = 0;
  while (n < 3) {
    const i = utf8.indexOf(ch, from);
    if (i < 0) break;
    const ctx = utf8.slice(Math.max(0, i - 40), i + 40).replace(/[\x00-\x1f\n]/g, '·');
    if (!/[。《》「」，]/.test(ctx)) { console.log(`  ${ch} @${i}: ${JSON.stringify(ctx)}`); n++; }
    from = i + 1;
  }
  if (!n) console.log(`  ${ch}: 无非释义文本的出现`);
}
