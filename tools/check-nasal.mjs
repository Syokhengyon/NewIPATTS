/*
 * check-nasal.mjs — 验证鼻化元音
 */
import { toEspeak, IPA_TO_ESPEAK } from '../src/ipa-espeak.mjs';
import { Speaker } from '../src/speak.mjs';
import { trimSilence } from '../src/audio.mjs';

const SR = 22050;

console.log('=== 1. 預組合鼻化元音 ===');
const PRE = ['ã', 'ẽ', 'ĩ', 'õ', 'ũ', 'ỹ', 'Ã', 'Ẽ', 'Ĩ', 'Õ', 'Ũ', 'Ỹ'];
for (const ch of PRE) {
  const r = toEspeak(ch + 'k⁵');
  console.log(`  ${ch}  → ${JSON.stringify(r.text).padEnd(10)} dropped=${JSON.stringify(r.dropped)}`);
}

console.log('\n=== 2. 組合波浪號 U+0303 ===');
for (const s of ['a\u0303', 'e\u0303', 'i\u0303', 'o\u0303', 'u\u0303',
                 'ɑ\u0303', 'ɛ\u0303', 'ɔ\u0303', 'œ\u0303', 'æ\u0303', 'y\u0303', 'ø\u0303']) {
  const r = toEspeak(s + 'k⁵');
  console.log(`  ${s}  → ${JSON.stringify(r.text).padEnd(12)} dropped=${JSON.stringify(r.dropped)}`);
}

console.log('\n=== 3. 其他寫法（本來就能過，不能弄壞）===');
for (const s of ['a~', 'e~', 'o~', 'a~k⁵', 'a']) {
  const r = toEspeak(s);
  console.log(`  ${JSON.stringify(s).padEnd(10)} → ${JSON.stringify(r.text).padEnd(10)} dropped=${JSON.stringify(r.dropped)}`);
}

console.log('\n=== 4. 越南語式疊加記號 ===');
for (const s of ['ẫ', 'ễ', 'ỗ', 'ỡ', 'ự', 'ậ', 'ỹ']) {
  const r = toEspeak(s);
  console.log(`  ${s}  → ${JSON.stringify(r.text).padEnd(10)} dropped=${JSON.stringify(r.dropped)}`);
}

console.log('\n=== 5. 一般 IPA 未被影響（回歸）===');
for (const s of ['tʰen⁵³', 'ɖɨw²¹²', 'ɣuɑŋ³¹', 'ʈʂɨk⁵', 'bʱa⁵³', 'ɭiæŋ²⁴', 'ʔa⁵³']) {
  const r = toEspeak(s);
  console.log(`  ${s.padEnd(10)} → ${JSON.stringify(r.text).padEnd(12)} dropped=${JSON.stringify(r.dropped)}`);
}

console.log('\n=== 6. 實際合成對比 ===');
const sp = await Speaker.create({ zeroInitial: 'none' });
sp.voice = 'ipa+wide80';
const CASES = [
  ['a', 'a53', '口元音（對照）'],
  ['ã', 'a~53', '鼻化 a'],
  ['ẽ', 'e~53', '鼻化 e'],
  ['ĩ', 'i~53', '鼻化 i'],
  ['õ', 'o~53', '鼻化 o'],
  ['ũ', 'u~53', '鼻化 u'],
  ['ɛ\u0303', 'E~53', '鼻化 ɛ'],
  ['ɔ\u0303', 'O~53', '鼻化 ɔ'],
];
console.log('  IPA    音素串    樣本數  時長ms  peak   說明');
for (const [ipa, esp, note] of CASES) {
  const r = await sp._synthRaw(`[[ ${esp} _: ]]`, 140);
  const tr = trimSilence(r.samples, { sr: SR });
  console.log(`  ${ipa.padEnd(6)} ${esp.padEnd(9)} ${String(r.n).padStart(6)}  ${String(Math.round(tr.length / SR * 1000)).padStart(6)}  ${r.peak.toFixed(3)}  ${note}`);
}

console.log('\n=== 7. 端到端：toEspeak → 合成 ===');
for (const ipa of ['ã⁵³', 'ẽ³¹', 'ĩ²¹²', 'õ⁵', 'ũ²⁴']) {
  const { text } = toEspeak(ipa);
  const r = await sp._synthRaw(`[[ ${text} _: ]]`, 140);
  const tr = trimSilence(r.samples, { sr: SR });
  console.log(`  ${ipa.padEnd(6)} → ${text.padEnd(8)} ${String(r.n).padStart(6)} 樣本 → 裁剪後 ${tr.length}`);
}
process.exit(0);
