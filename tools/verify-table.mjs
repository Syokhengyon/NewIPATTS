/*
 * verify-table.mjs — 转写表核对
 *
 * ⚠️ 本脚本**只核对结构性事实**，不判断「能不能发音」。
 *
 * 为什么：曾经用「合成 [[Xa]] 与 [[a]] 的样本数差」当生效判据，结果把
 * u/ʊ/ɨ/ɯ 这些明明能发的音误判成失效 —— espeak 会给音节分配总时长，
 * 塞入元音韵头不会让音节变长，所以时长差无法区分「静音」与「发音但总时长不变」。
 * **能否发音一律以人耳试听为准**，记录在 reference/missing-ipa-findings.md。
 *
 * 核对项：
 *   A. 作者原表与 reference/author-ipa-to-ascii.py 逐条一致
 *   B. 每个取值都能拆成 phontab 里存在的音素名（拼写合法）
 *   C. 增补表每条都标了来源
 *   D. 未映射 / 候补 / 作者表可疑项 都已登记
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IPA_TO_ESPEAK, IPA_TO_ESPEAK_AUTHOR, IPA_TO_ESPEAK_EXT, EXT_CAVEATS,
  CONFLICTS, UNMAPPED, AUTHOR_DEAD, OVERRIDES,
} from '../src/ipa-espeak.mjs';

/*
 * 已登记、可接受的碰撞。碰撞 = 引擎分不开这几个音，多個 IPA 對到同一個音素名。
 * 每一條都要有理由，不能隨手加。
 */
const KNOWN_COLLISIONS = new Map([
  ['r', 'ɾ（閃音）與 r（顫音）共用 —— 引擎無獨立閃音，使用者決定不改'],
  ['Y', 'ʏ 與作者表的 ø 共用 —— 引擎分不開，使用者決定保留'],
  ['b`', '（ʙ 已撤除，此條保留作歷史記錄）'],
  ['?\\', 'ʕ 與 ˤ（咽化記號）共用 —— ˤ 是「用咽擦音近似」的既定方案'],
  ['h', 'ʰ（送氣記號）與 h（喉擦音）本是同音，且作者表對 pʰ 等也是映射成 ph'],
  ['h.', 'ʱ（濁送氣）與 ɦ 共用 —— 使用者指定 ʱ 一律當 ɦ'],
  ['~', '組合波浪號 U+0303 與 ASCII `~` 是同一記號的兩種寫法，合併是正確的'],
]);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;

/* ---------- A. 与作者原文比对 ---------- */
console.log('=== A. 与作者原文比对（reference/author-ipa-to-ascii.py）===');
const src = fs.readFileSync(path.join(ROOT, 'reference', 'author-ipa-to-ascii.py'), 'utf8');
const ref = new Map();
for (const line of src.split(/\r?\n/)) {
  const s = line.trim();
  if (!s || s.startsWith('#') || s.startsWith('ipa_to_ascii') || s === '}') continue;
  const m = s.match(/^(['"])(.*?)\1\s*:\s*(['"])(.*?)\3\s*,?\s*(#.*)?$/);
  if (!m) continue;
  ref.set(m[2].replace(/\\"/g, '"'), m[4].replace(/\\"/g, '"'));
}
{
  const onlyRef = [...ref].filter(([k]) => !(k in IPA_TO_ESPEAK_AUTHOR));
  const onlyJs = Object.entries(IPA_TO_ESPEAK_AUTHOR).filter(([k]) => !ref.has(k));
  const diff = [...ref].filter(([k, v]) => k in IPA_TO_ESPEAK_AUTHOR && IPA_TO_ESPEAK_AUTHOR[k] !== v);
  if (!onlyRef.length && !onlyJs.length && !diff.length) console.log(`  ✓ 完全一致（${ref.size} 条）`);
  else {
    fail++;
    onlyRef.forEach(([k, v]) => console.log(`  ✗ 原文有 JS 缺: ${JSON.stringify(k)} -> ${JSON.stringify(v)}`));
    onlyJs.forEach(([k, v]) => console.log(`  ✗ JS 有原文无: ${JSON.stringify(k)} -> ${JSON.stringify(v)}`));
    diff.forEach(([k, a]) => console.log(`  ✗ 值不一致: ${JSON.stringify(k)} 原文=${JSON.stringify(a)}`));
  }
}

/* ---------- B. 取值拼写合法性 ---------- */
console.log('\n=== B. 取值能否拆成 phontab 里存在的音素名（只查拼写）===');
const names = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'reference', 'engine-phoneme-names.json'), 'utf8')).names);
const byLen = [...names].sort((a, b) => b.length - a.length);
function decompose(v) {
  const parts = []; let i = 0;
  while (i < v.length) {
    if (/[0-9_.:;'"`~·^]/.test(v[i])) { i++; continue; }
    let hit = null;
    for (const n of byLen) { if (n && v.startsWith(n, i)) { hit = n; break; } }
    if (!hit) return { ok: false, bad: v.slice(i) };
    parts.push(hit); i += hit.length;
  }
  return { ok: true, parts };
}
{
  const bad = [];
  for (const [ipa, v] of Object.entries(IPA_TO_ESPEAK)) {
    if (!v) continue;
    const d = decompose(v);
    if (!d.ok) bad.push([ipa, v, d.bad]);
  }
  if (!bad.length) console.log(`  ✓ 全部 ${Object.keys(IPA_TO_ESPEAK).length} 条取值拼写合法`);
  else { fail++; bad.forEach(([i, v, b]) => console.log(`  ✗ ${i} -> ${v}  卡在 ${JSON.stringify(b)}`)); }
}

/* ---------- B2. 我引入的碰撞 ---------- */
console.log('\n=== B2. 我新增/覆蓋的條目是否與既有項碰撞 ===');
{
  const byName = new Map();
  for (const [ipa, esp] of Object.entries(IPA_TO_ESPEAK)) {
    if (!esp) continue;
    if (!byName.has(esp)) byName.set(esp, []);
    byName.get(esp).push(ipa);
  }
  const mine = new Set([...Object.keys(IPA_TO_ESPEAK_EXT), ...Object.keys(OVERRIDES)]);
  const bad = [];
  for (const [esp, list] of byName) {
    if (list.length < 2) continue;
    if (!list.some(i => mine.has(i))) continue;
    if (KNOWN_COLLISIONS.has(esp)) continue;
    bad.push([esp, list]);
  }
  if (!bad.length) {
    console.log('  ✓ 無未登記的碰撞');
    const known = [...byName.entries()].filter(([e, l]) => l.length > 1 && l.some(i => mine.has(i)));
    known.forEach(([e, l]) => console.log(`    （已登記）${e.padEnd(4)} ← ${l.join(' ')}\n             理由：${KNOWN_COLLISIONS.get(e) || '—'}`));
  } else {
    fail++;
    console.log(`  ✗ 發現 ${bad.length} 處未登記的碰撞：`);
    bad.forEach(([e, l]) => console.log(`    ${e} ← ${l.join(' ')}`));
    console.log('    碰撞 = 引擎分不開這幾個音，聽感上就是「跟別的混了」。');
    console.log('    要嘛撤除其中一個，要嘛加進 KNOWN_COLLISIONS 並註明理由。');
  }
}

/* ---------- C. 增补表来源 ---------- */
console.log('\n=== C. 增補表（須逐條註明來源）===');
const SRC_EAR = '★ 使用者試聽';
const NOTE = {
  'ɭ': 'phsource `ipa ɭ` + 試聽',
  'ɬ': 'phsource `l# // Lateral fricative` + 試聽',
  'ʎ': 'phsource `l^ // palatal l` + 試聽',
  'ç': 'phsource `C // German ich` + 試聽',
  'ʝ': 'phsource `J^ // Kirshenbaum C<vcd>` + 試聽',
  't̪': 'phsource `t[ // dental variant of /t/` + 試聽',
  'd̪': 'phsource `d[` + 試聽',
  'n̪': 'phsource `n[` + 試聽',
  'ʏ': SRC_EAR + '：「用 Y 完全沒問題」',
  'ʕ': SRC_EAR + '：第二輪更正為 ?\\',
  'ħ': SRC_EAR + '：唯一能發的寫法',
  'ɸ': SRC_EAR + '：唯一能發（借 f）',
  'ɱ': SRC_EAR + '：唯一能發（借 m）',
  'ɟ': SRC_EAR + '：唯一能發（借 d）',
  'ʙ': SRC_EAR + '：唯一能發',
  'ⱱ': SRC_EAR + '：唯一能發（借 v）',
  'ɾ': SRC_EAR + '：唯一能發（與 r 同名）',
  'ɮ': SRC_EAR + '：唯一能發',
  'ʟ': SRC_EAR + '：唯一能發（l^ 已被 ʎ 佔用）',
  'θ': SRC_EAR + '：唯一能發，但明確指出「不像英語 th」',
  'ð': SRC_EAR + '：唯一能發，同上',
  'ʰ': '送氣符號的通用兜底 —— 作者表只收了具體的 pʰ tʰ kʰ…，單獨的 ʰ 會漏掉',
  '̃': '組合波浪號 U+0303 → `~`。引擎把 `~` 當可疊加的鼻化特徵，'
     + '實測 a~/a、e~/e、E~/E、ee~/ee、A.~/A.、Y~/Y 輸出全都不同（見 tools/check-nasal3.mjs）',
};
let earCount = 0;
for (const [ipa, v] of Object.entries(IPA_TO_ESPEAK_EXT)) {
  const n = NOTE[ipa];
  if (n && n.startsWith(SRC_EAR)) earCount++;
  console.log(`  ${n ? '✓' : '✗'} ${ipa.padEnd(4)} -> ${v.padEnd(5)} ${n || '（未注明来源）'}`);
  if (!n) fail++;
}
console.log(`  其中 ${earCount}/${Object.keys(IPA_TO_ESPEAK_EXT).length} 條的依據含使用者試聽`);

console.log('\n=== C2. 音值備註（能發但未必精確）===');
for (const [ipa, note] of Object.entries(EXT_CAVEATS)) {
  console.log(`  ${ipa.padEnd(4)} ${note}`);
}

/* ---------- D. 各类登记项 ---------- */
console.log('\n=== D. 登記項 ===');
console.log(`  覆蓋表 OVERRIDES        ${Object.keys(OVERRIDES).length}  → ${Object.keys(OVERRIDES).join(' ')}`);
console.log(`  音值備註 CAVEATS        ${Object.keys(EXT_CAVEATS).length}  → ${Object.keys(EXT_CAVEATS).join(' ')}`);
console.log(`  仍未映射 UNMAPPED        ${Object.keys(UNMAPPED).length}  → ${Object.keys(UNMAPPED).join(' ')}`);
console.log(`  作者表可疑 AUTHOR_DEAD   ${Object.keys(AUTHOR_DEAD).length}`);
console.log(`  取值分歧 CONFLICTS       ${Object.keys(CONFLICTS).length}  → ${Object.keys(CONFLICTS).join(' ')}`);

const findings = path.join(ROOT, 'reference', 'missing-ipa-findings.md');
console.log(`\n  試聽記錄：${fs.existsSync(findings) ? '✓ reference/missing-ipa-findings.md' : '✗ 缺失'}`);
if (!fs.existsSync(findings)) fail++;

/* ---------- 汇总 ---------- */
console.log(`\n合并表条目 ${Object.keys(IPA_TO_ESPEAK).length}`
  + `（作者 ${Object.keys(IPA_TO_ESPEAK_AUTHOR).length} + 增補 ${Object.keys(IPA_TO_ESPEAK_EXT).length}）`);
console.log('\n注意：本脚本不判断「能不能發音」。那只能靠人耳試聽。');
console.log(fail ? '\n★ 有需修正项' : '\n★ 结构核对通过');
process.exit(fail ? 1 : 0);
