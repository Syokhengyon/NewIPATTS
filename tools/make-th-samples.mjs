/*
 * make-th-samples.mjs — 生成 θ/ð 的候选试听样本
 *
 * 思路：与其继续用量测猜，不如直接生 WAV 让人耳判 ——
 * 使用者本来就是唯一裁判。
 *
 * 包括：
 *   · espeak **英語語音**念 think / this（這是標準答案，θ 一定對）
 *   · ipa 語音下各候選音素的孤立音 + 與 a 的組合
 *   · 目前映射表實際用的 s[ / z[
 *
 * 輸出到 reference/th-samples/，同時附一份對照表。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEngine } from '../src/engine.mjs';
import { encodeWav } from '../src/audio.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'reference', 'th-samples');
fs.mkdirSync(OUT, { recursive: true });
const M = await openEngine(path.join(ROOT, 'engine'));
console.error = () => {};
const SR = 22050;

/** 每次合成用全新 worker，避免語音切換把 engine 弄髒 */
function synth(voice, text, cap = SR * 5) {
  return new Promise(res => {
    const w = new M.eSpeakNGWorker();
    try { w.set_voice(voice); } catch (e) {}
    w.set_rate(140); w.set_pitch(40);
    const chunks = []; let n = 0, done = false;
    const fin = () => {
      if (done) return; done = true;
      const s = new Float32Array(n); let p = 0;
      for (const c of chunks) { s.set(c, p); p += c.length; }
      try { w.delete(); } catch (e) {}
      res(s);
    };
    try {
      w.synthesize(text, (d) => {
        if (!d || !d.length) { fin(); return 0; }
        const half = Math.floor(d.length / 2);
        const a = new Float32Array(half);
        for (let i = 0; i < half; i++) a[i] = d[i * 2];
        chunks.push(a); n += half;
        if (n > cap) { fin(); return 1; }
        return 0;
      });
    } catch (e) { fin(); return; }
    setTimeout(fin, 3000);
  });
}

function concat(parts, gapMs = 260) {
  const total = parts.reduce((a, p) => a + p.length, 0) + Math.floor(SR * gapMs / 1000) * (parts.length - 1);
  const out = new Float32Array(total);
  let p = 0;
  for (let i = 0; i < parts.length; i++) {
    out.set(parts[i], p); p += parts[i].length;
    if (i < parts.length - 1) p += Math.floor(SR * gapMs / 1000);
  }
  return out;
}
function save(name, samples) {
  const wav = encodeWav(samples, SR);
  fs.writeFileSync(path.join(OUT, name), Buffer.from(wav));
  return `${name}  ${(samples.length / SR).toFixed(2)}s`;
}

const log = [];

/* ---------- 1. 英語語音：標準答案 ---------- */
console.log('=== ① 英語語音（標準答案） ===');
for (const word of ['think', 'this', 'three', 'father', 'bath', 'either', 'thanks', 'though']) {
  const s = await synth('en', word);
  if (s.length > 400) { const r = save(`en_${word}.wav`, s); console.log('  ' + r); log.push(r); }
  else console.log(`  en "${word}" → 無輸出`);
}
/* 一整句，聽連讀 */
{
  const s = await synth('en', 'I think this is three, and that is the other thing.');
  if (s.length > 400) { const r = save('en_sentence.wav', s); console.log('  ' + r); log.push(r); }
}

/* ---------- 2. ipa 語音下的候選 ---------- */
console.log('\n=== ② ipa 語音：θ 候選（孤立 + 與 a 組合） ===');
const THETA = [
  ['s[', '目前映射表用的'],
  ['T', 'espeak 的 Kirshenbaum θ'],
  ['f', '對照（脣齒）'],
  ['s', '對照（齒齦）'],
  ['t[', '?'],
  ['T[', '?'],
  ['F', '?'],
];
for (const [ph, note] of THETA) {
  const iso = await synth('ipa', `[[ ${ph} _: ]]`);
  const ctx = await synth('ipa', `[[ a ${ph} a _: ]]`);
  const both = concat([iso, ctx]);
  const r = save(`ipa_theta_${ph.replace(/[[\]]/g, 'x')}.wav`, both);
  console.log(`  ${ph.padEnd(4)} (${note})  ${r}`);
  log.push(`${ph}\t${note}\t${r}`);
}

console.log('\n=== ③ ipa 語音：ð 候選 ===');
const ETH = [
  ['z[', '目前映射表用的'],
  ['D', 'espeak 的 Kirshenbaum ð'],
  ['v', '對照（脣齒）'],
  ['z', '對照（齒齦）'],
  ['d[', '?'],
  ['D[', '?'],
];
for (const [ph, note] of ETH) {
  const iso = await synth('ipa', `[[ ${ph} _: ]]`);
  const ctx = await synth('ipa', `[[ a ${ph} a _: ]]`);
  const both = concat([iso, ctx]);
  const r = save(`ipa_eth_${ph.replace(/[[\]]/g, 'x')}.wav`, both);
  console.log(`  ${ph.padEnd(4)} (${note})  ${r}`);
  log.push(`${ph}\t${note}\t${r}`);
}

/* ---------- 3. 對照：英語單詞 vs ipa 拼出的同詞 ---------- */
console.log('\n=== ④ 同一句話：en 語音 vs ipa 語音 ===');
{
  const a = await synth('en', 'think this');
  const b = await synth('ipa', '[[ T i n k _: ]]');
  const c = await synth('ipa', '[[ s[ i n k _: ]]');
  const r = save('cmp_en_vs_ipa.wav', concat([a, b, c], 420));
  console.log(`  en「think this」→ [[ T i n k ]] → [[ s[ i n k ]]   ${r}`);
  console.log('  （三段連放：先英語原生，再用 T，再用目前映射的 s[）');
  log.push(r);
}

fs.writeFileSync(path.join(OUT, 'README.txt'),
  'θ / ð 候選試聽樣本\n\n' +
  '① en_*.wav —— espeak 英語語音，這是「標準答案」，θ/ð 一定正確\n' +
  '② ipa_theta_*.wav —— ipa 語音下各候選：前半是孤立音，後半是 a_音_a\n' +
  '③ ipa_eth_*.wav —— 同上，ð\n' +
  '④ cmp_en_vs_ipa.wav —— 同一句話三段：英語原生 / 用 T / 用目前映射的 s[\n\n' +
  '對照表：\n' + log.join('\n') + '\n', 'utf8');

console.log(`\n全部寫到 ${OUT}`);
process.exit(0);
