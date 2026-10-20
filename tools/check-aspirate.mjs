/*
 * check-aspirate.mjs — 验证 ʰ / ʱ 的处理
 */
import { toEspeak, OVERRIDES, IPA_TO_ESPEAK } from '../src/ipa-espeak.mjs';
import { Speaker } from '../src/speak.mjs';

console.log('=== 1. ʱ 现在一律走 ɦ（音素名 h.）===');
const SETS = [
  ['濁送氣（作者原表已有，被覆盖）', ['pʱ', 'tʱ', 'kʱ', 'fʱ', 'sʱ', 'ʃʱ', 'tʃʱ', 't͡sʱ', 't͡ʂʱ']],
  ['濁送氣（作者原表没有，走兜底）', ['bʱ', 'dʱ', 'ɡʱ', 'ɖʱ', 'dzʱ', 'dʐʱ', 'dʑʱ', 'ɟʱ', 'gʱ']],
  ['清送氣（應保持 h）', ['pʰ', 'tʰ', 'kʰ', 'tsʰ', 'tʂʰ', 'tɕʰ', 'tʃʰ', 'bʰ', 'dʰ']],
];
for (const [label, list] of SETS) {
  console.log(`\n  ${label}`);
  for (const s of list) {
    const c = toEspeak(s + 'a');
    console.log(`    ${s.padEnd(6)} → ${JSON.stringify(c.text).padEnd(12)} dropped=${JSON.stringify(c.dropped)}`);
  }
}

console.log('\n=== 2. ɦ 本身 ===');
for (const s of ['ɦa', 'ɦʷa', 'ha', 'hʷa']) {
  const c = toEspeak(s);
  console.log(`  ${s.padEnd(5)} → ${JSON.stringify(c.text)}`);
}

console.log('\n=== 3. OVERRIDES 里 ʱ 相关的条目 ===');
const asp = Object.entries(OVERRIDES).filter(([k]) => k.includes('ʱ') || k === 'ʱ');
console.log(`  共 ${asp.length} 条`);
for (const [k, v] of asp) console.log(`    ${k.padEnd(8)} → ${v}`);

console.log('\n=== 4. 对照：ʱ 与 ʰ 的音频应当不同 ===');
const sp = await Speaker.create();
sp.voice = 'ipa+wide80';
for (const esp of ['bha53', 'bh.a53', 'bʰa53', 'ba53', 'h.a53', 'ha53']) {
  const r = await sp._synthRaw(`[[ ${esp} _: ]]`, 140);
  console.log(`  [[ ${esp.padEnd(8)} ]]  ${String(r.n).padStart(6)} 樣本  peak=${r.peak.toFixed(3)}`);
}

console.log('\n=== 5. 之前 vs 现在 ===');
console.log('  之前: bʱa → "bha"   （清 h，作者的处理）');
console.log('  现在: bʱa → ' + JSON.stringify(toEspeak('bʱa').text) + '   （ɦ）');
process.exit(0);
