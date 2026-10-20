/*
 * build-mnemonic-map.mjs — 从 espeak-ng 的 phsource/phonemes 生成权威的「音素名 → IPA」表
 *
 * 输入：web_fetch 的溢出文件（GitHub contents API 返回的 JSON，content 是 base64）
 * 输出：reference/espeak-mnemonics.json —— { 音素名: IPA }
 *
 * 用途：核对作者那张表，并为表里缺的 IPA（ɭ θ ð ħ ʕ …）找出正确的音素名。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const spill = process.argv[2];
if (!spill) { console.error('用法: node build-mnemonic-map.mjs <spill文件>'); process.exit(1); }

const raw = fs.readFileSync(spill, 'utf8');
const m = raw.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
if (!m) { console.error('没找到 content 字段'); process.exit(1); }
const text = Buffer.from(JSON.parse('"' + m[1] + '"'), 'base64').toString('utf8');
fs.mkdirSync(path.join(ROOT, 'reference'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reference', 'espeak-phsource-phonemes.txt'), text, 'utf8');
console.log(`已解出 phsource/phonemes：${text.length} 字符`);

/* 解析：phoneme <name> ... ipa <value> ... endphoneme */
const lines = text.split(/\r?\n/);
const map = {};              // name -> ipa
const rawMap = {};           // name -> 原始 ipa 行
let cur = null;
for (const line of lines) {
  const t = line.trim();
  const mp = t.match(/^phoneme\s+(\S+)/);
  if (mp) { cur = mp[1]; continue; }
  if (t === 'endphoneme') { cur = null; continue; }
  if (!cur) continue;
  const mi = t.match(/^ipa\s+(.+)$/);
  if (mi) { rawMap[cur] = mi[1].trim(); }
}
console.log(`解析出 ${Object.keys(rawMap).length} 个带 ipa 行的音素`);

/* 只保留「单个 IPA 符号」的 —— 多符号的（如 t͡s）另计 */
const toks = s => Array.from(s.replace(/[\s\u00a0]/g, ''));
for (const [name, v] of Object.entries(rawMap)) {
  /* ipa 行可能是 "ʂ" 这种单符号，也可能是条件式；取第一个字段 */
  const first = v.split(/\s+/)[0];
  if (first && first !== 'NULL') map[name] = first;
}

fs.writeFileSync(path.join(ROOT, 'reference', 'espeak-mnemonics.json'),
  JSON.stringify({ nameToIpa: map, raw: rawMap }, null, 1), 'utf8');
console.log(`已写出 reference/espeak-mnemonics.json（${Object.keys(map).length} 条）`);

/* 针对关心的符号，反查音素名 */
console.log('\n=== 关键 IPA → 音素名 ===');
const WANT = ['ɭ', 'ɮ', 'θ', 'ð', 'ħ', 'ʕ', 'ʜ', 'ʢ', 'ɸ', 'β', 'ʏ', 'ɶ', 'ɱ', 'ɳ', 'ɲ', 'ŋ',
              'ʈ', 'ɖ', 'ɽ', 'ʀ', 'ɘ', 'ɵ', 'ɤ', 'ɯ', 'ʉ', 'ɨ', 'ʌ', 'ɔ', 'œ', 'ø', 'ɜ', 'ɞ',
              'ɒ', 'ɐ', 'æ', 'ç', 'ʝ', 'ʎ', 'ɬ', 'ʂ', 'ʐ', 'ɕ', 'ʑ', 'ɣ', 'χ', 'ʁ', 'ʔ', 'ɦ',
              'p', 't', 'k', 'f', 's', 'x', 'h', 'l', 'n', 'm', 'j', 'w', 'r'];
const inverted = {};
for (const [name, ipa] of Object.entries(map)) {
  if (!inverted[ipa]) inverted[ipa] = [];
  inverted[ipa].push(name);
}
for (const s of WANT) {
  const names = inverted[s];
  console.log(`  ${s.padEnd(3)} ${names ? '✓ ' + names.join(' ') : '✗ 未找到'}`);
}

console.log('\n=== 含咽化标记 ˤ 的音素名 ===');
const phar = Object.entries(rawMap).filter(([, v]) => /ˤ|\u0334/.test(v));
if (phar.length) phar.forEach(([n, v]) => console.log(`  ${n.padEnd(10)} ipa=${v}`));
else console.log('  （phsource/phonemes 里没有）');

console.log('\n=== 咽音 ħ ʕ 在哪些音素名上 ===');
for (const [n, v] of Object.entries(rawMap)) {
  if (/[ħʕʜʢ]/.test(v)) console.log(`  ${n.padEnd(10)} ipa=${v}`);
}
