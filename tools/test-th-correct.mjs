/*
 * test-th-correct.mjs — 用正确的上下文测 θ
 *
 * 之前的错误：一律用 `[[ X _: ]]`，而 espeak 对「停頓前的 T」走的是
 *   IF nextPh(isPause) THEN WAV(ufric/th_)   ← 弱化變體
 *   WAV(ufric/th)                            ← 完整 θ（後接元音時才用）
 * 所以量到的是 th_，不是 th。
 *
 * 這次測 `[[ X a _: ]]`，並只取**輔音段**（元音開始之前）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEngine } from '../src/engine.mjs';
import { encodeWav } from '../src/audio.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = await openEngine(path.join(ROOT, 'engine'));
console.error = () => {};
const SR = 22050;

function synth(voice, text, cap = SR * 3) {
  return new Promise(res => {
    const w = new M.eSpeakNGWorker();
    try { w.set_voice(voice); } catch (e) { return res(null); }
    w.set_rate(140); w.set_pitch(40);
    const chunks = []; let n = 0, done = false, capped = false;
    const fin = () => {
      if (done) return; done = true;
      const s = new Float32Array(n); let p = 0;
      for (const c of chunks) { s.set(c, p); p += c.length; }
      try { w.delete(); } catch (e) {}
      res({ s, capped });
    };
    try {
      w.synthesize(text, (d) => {
        if (!d || !d.length) { fin(); return 0; }
        const half = Math.floor(d.length / 2);
        const a = new Float32Array(half);
        for (let i = 0; i < half; i++) a[i] = d[i * 2];
        chunks.push(a); n += half;
        if (n > cap) { capped = true; fin(); return 1; }
        return 0;
      });
    } catch (e) { fin(); return; }
    setTimeout(fin, 2500);
  });
}

const NB = 24, F0 = 200, F1 = 9000;
const BANDS = [];
for (let i = 0; i < NB; i++) BANDS.push(F0 * Math.pow(F1 / F0, (i + 0.5) / NB));
function onset(s, t = 0.008) { for (let i = 0; i < s.length; i++) if (Math.abs(s[i]) > t) return i; return s.length; }
function head(s, ms) { const a = onset(s); return s.subarray(a, Math.min(a + Math.floor(SR * ms / 1000), s.length)); }
function spec(s) {
  if (!s || s.length < 200) return null;
  const ps = BANDS.map(f => {
    const k = 2 * Math.cos(2 * Math.PI * f / SR);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < s.length; i++) {
      const w = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (s.length - 1));
      const s0 = s[i] * w + k * s1 - s2; s2 = s1; s1 = s0;
    }
    return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2));
  });
  const sum = ps.reduce((a, b) => a + b, 0) || 1;
  const v = ps.map(p => p / sum);
  let num = 0; for (let i = 0; i < NB; i++) num += BANDS[i] * v[i];
  return { v, centroid: num };
}
const tv = (a, b) => { if (!a || !b) return 1; let d = 0; for (let i = 0; i < NB; i++) d += Math.abs(a.v[i] - b.v[i]); return d / 2; };

/* 基準：英語 θ（think 的開頭擦音） */
const enTh = spec(head((await synth('en', 'think')).s, 70));
const enDh = spec(head((await synth('en', 'this')).s, 70));
console.log(`基準：英語 θ 重心 ${Math.round(enTh.centroid)} Hz   ð 重心 ${Math.round(enDh.centroid)} Hz\n`);

console.log('=== 兩種上下文對比：停頓前（th_） vs 後接元音（th）===');
console.log('  音素    [[ X _: ]]        [[ X a _: ]] 前 55ms');
for (const ph of ['T', 'D', 's[', 'z[', 's', 'z', 'f']) {
  const r1 = await synth('ipa', `[[ ${ph} _: ]]`);
  const r2 = await synth('ipa', `[[ ${ph} a _: ]]`);
  const f1 = r1 && !r1.capped ? spec(head(r1.s, 90)) : null;
  const f2 = r2 && !r2.capped ? spec(head(r2.s, 55)) : null;
  const d1 = f1 ? tv(f1, enTh) : 1, d2 = f2 ? tv(f2, enTh) : 1;
  console.log(`  ${ph.padEnd(6)}  ${String(f1 ? Math.round(f1.centroid) : 0).padStart(5)}Hz d=${d1.toFixed(3)}   ${String(f2 ? Math.round(f2.centroid) : 0).padStart(5)}Hz d=${d2.toFixed(3)}${d2 < 0.25 ? '  ★' : ''}`);
}

/* 生成試聽：只取輔音段 */
const seq = [], names = [];
const add = (l, r, ms) => { if (r && r.s && r.s.length) { seq.push(head(r.s, ms)); names.push(l); } };
add('英語 θ (think)', await synth('en', 'think'), 70);
add('英語 ð (this)', await synth('en', 'this'), 70);
for (const ph of ['T', 'D', 's[', 'z[', 's', 'z', 'f', 'v']) {
  add(`ipa ${ph}`, await synth('ipa', `[[ ${ph} a _: ]]`), 55);
}
const gap = Math.floor(SR * 0.28);
const total = seq.reduce((a, s) => a + s.length, 0) + gap * (seq.length - 1);
const out = new Float32Array(total);
let p = 0;
for (const s of seq) { out.set(s, p); p += s.length + gap; }
let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
if (peak > 0) for (let i = 0; i < out.length; i++) out[i] = out[i] / peak * 0.85;
const OUT = path.join(ROOT, 'reference', 'th-samples');
fs.writeFileSync(path.join(OUT, 'fricative_context.wav'), Buffer.from(encodeWav(out, SR)));

console.log(`\n試聽：reference/th-samples/fricative_context.wav`);
console.log('  順序：');
names.forEach((n, i) => console.log(`    ${i + 1}. ${n}`));
process.exit(0);
