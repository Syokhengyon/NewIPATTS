/*
 * check-chart.mjs — 复现 chart.html 的格子状态，报出哪些 IPA 尚未收录
 *
 * 只判断「转写表有没有这一项」，不判断能不能发音（那只能靠人耳试听）。
 */
import { toEspeak, IPA_TO_ESPEAK, EXT_CAVEATS, UNMAPPED } from '../src/ipa-espeak.mjs';

const CONS = [
  ['塞音',   ['p b', '', 't̪ d̪', 't d', '', 'ʈ ɖ', 'c ɟ', 'k ɡ', 'q ɢ', '', 'ʔ']],
  ['鼻音',   ['m', 'ɱ', '', 'n', '', 'ɳ', 'ɲ', 'ŋ', 'ɴ', '', '']],
  ['顫音',   ['ʙ', '', '', 'r', '', '', '', '', 'ʀ', '', '']],
  ['閃音',   ['', 'ⱱ', '', 'ɾ', '', 'ɽ', '', '', '', '', '']],
  ['擦音',   ['ɸ β', 'f v', 'θ ð', 's z', 'ʃ ʒ', 'ʂ ʐ', 'ç ʝ', 'x ɣ', 'χ ʁ', 'ħ ʕ', 'h ɦ']],
  ['邊擦音', ['', '', '', 'ɬ ɮ', '', '', '', '', '', '', '']],
  ['近音',   ['', 'ʋ', '', 'ɹ', '', 'ɻ', 'j', 'ɰ', '', '', '']],
  ['邊近音', ['', '', '', 'l', '', 'ɭ', 'ʎ', 'ʟ', '', '', '']],
];
const AFFR = ['t͡s d͡z', 't͡ʃ d͡ʒ', 't͡ʂ d͡ʐ', 't͡ɕ d͡ʑ'];
const VOWS = [
  ['閉',   'i y', 'ɨ ʉ', 'ɯ u'],
  ['次閉', 'ɪ ʏ', '',    'ʊ'],
  ['半閉', 'e ø', 'ɘ ɵ', 'ɤ o'],
  ['中',   '',    'ə',   ''],
  ['半開', 'ɛ œ', 'ɜ ɞ', 'ʌ ɔ'],
  ['次開', 'æ',   'ɐ',   ''],
  ['開',   'a ɶ', '',    'ɑ ɒ'],
];

const all = [];
CONS.forEach(([m, cols]) => cols.forEach(c => c && c.split(' ').forEach(s => all.push([m, s]))));
AFFR.forEach(c => c.split(' ').forEach(s => all.push(['塞擦', s])));
VOWS.forEach(([r, ...cols]) => cols.forEach(c => c && c.split(' ').forEach(s => all.push([r, s]))));

const miss = [], ok = [];
console.log('未收錄的格子：');
for (const [grp, sym] of all) {
  const conv = toEspeak(sym);
  const inTable = conv.text.length > 0 && conv.dropped.length === 0;
  if (inTable) ok.push(sym);
  else { miss.push(sym); console.log(`  ${grp.padEnd(5)} ${sym.padEnd(4)} → 丟棄`); }
}

console.log(`\n=== 彙總（共 ${all.length} 格）===`);
console.log(`  ✓ 轉寫表有收錄    ${ok.length}`);
console.log(`  ✗ 未收錄（丟棄）  ${miss.length}  ${miss.join(' ')}`);

console.log(`\n=== 音值備註（能發但未必精確，${Object.keys(EXT_CAVEATS).length} 項）===`);
for (const [ipa, note] of Object.entries(EXT_CAVEATS)) console.log(`  ${ipa.padEnd(4)} ${note}`);

console.log(`\n=== 仍未映射（${Object.keys(UNMAPPED).length} 項）===`);
for (const [ipa, note] of Object.entries(UNMAPPED)) console.log(`  ${ipa.padEnd(4)} ${note}`);

console.log(`\n合併表共 ${Object.keys(IPA_TO_ESPEAK).length} 條`);
console.log('※ 能否發音只能靠人耳試聽，見 reference/missing-ipa-findings.md');
