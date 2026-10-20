/*
 * compare-th-fricative.mjs — 只比擦音段，避开元音
 *
 * 之前的教训：`[[ T a ]]` 里能量最高的是元音 a，
 * 所以量到「重心 641Hz」是元音的，不是 θ 的。
 *
 * 這次：
 *   · en 語音的 "think"/"this" → 切出**開頭那段擦音**
 *   · ipa 語音的 [[ T _: ]] / [[ s[ _: ]] … → 本身就是純擦音
 *   兩邊都只留擦音，再比頻譜。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEngine } from '../src/engine.mjs';
import { encodeWav } from '../src/audio.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'reference', 'th-samples');
const M = await openEngine(path.join(ROOT, 'engine'));
console.error = () => {};
const SR = 22050;

function synth(voice, text, cap = SR * 4) {
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

/** 找第一個有聲音的位置 */
function onset(s, thresh = 0.01) {
  for (let i = 0; i < s.length; i++) if (Math.abs(s[i]) > thresh) return i;
  return s.length;
}

/** 從第一個有聲音處取 N 毫秒 */
function head(s, ms) {
  const a = onset(s);
  const n = Math.floor(SR * ms / 1000);
  return s.subarray(a, Math.min(a + n, s.length));
}

/* 24 段對數頻帶頻譜 */
const NB = 24, F0 = 200, F1 = 9000;
const BANDS = [];
for (let i = 0; i < NB; i++) BANDS.push(F0 * Math.pow(F1 / F0, (i + 0.5) / NB));
function spec(s) {
  if (!s || s.length < 200) return null;
  const ps = BANDS.map(f => {
    const k = 2 * Math.cos(2 * Math.PI * f / SR);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < s.length; i++) {
      const w = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (s.length - 1));   // Hamming
      const s0 = s[i] * w + k * s1 - s2; s2 = s1; s1 = s0;
    }
    return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2));
  });
  const sum = ps.reduce((a, b) => a + b, 0) || 1;
  const v = ps.map(p => p / sum);
  let num = 0;
  for (let i = 0; i < NB; i++) num += BANDS[i] * v[i];
  return { v, centroid: num };
}
const tv = (a, b) => {
  if (!a || !b) return 1;
  let d = 0; for (let i = 0; i < NB; i++) d += Math.abs(a.v[i] - b.v[i]);
  return d / 2;
};

/* ---------- 取樣本 ---------- */
const EN = {
  'en think 的 θ': head(await synth('en', 'think'), 70),
  'en this 的 ð': head(await synth('en', 'this'), 70),
  'en three 的 θ': head(await synth('en', 'three'), 70),
};
const IPA = {};
for (const ph of ['T', 'D', 's[', 'z[', 's', 'z', 'f', 'v', 't[', 'd[']) {
  const s = await synth('ipa', `[[ ${ph} _: ]]`);
  /* 純擦音：整個信號就是擦音，但前後可能有靜音，取中間有聲段 */
  IPA[`ipa [[ ${ph} ]]`] = head(s, 90);
}

console.log('=== 英語原生（標準答案） ===');
for (const [k, s] of Object.entries(EN)) {
  const f = spec(s); if (f) console.log(`  ${k.padEnd(18)} 重心 ${String(Math.round(f.centroid)).padStart(4)} Hz   樣本 ${s.length}`);
}
console.log('\n=== ipa 語音下的候選（純擦音） ===');
const ipaFeat = {};
for (const [k, s] of Object.entries(IPA)) {
  const f = spec(s); ipaFeat[k] = f;
  if (f) console.log(`  ${k.padEnd(18)} 重心 ${String(Math.round(f.centroid)).padStart(4)} Hz   樣本 ${s.length}`);
  else console.log(`  ${k.padEnd(18)} 無聲`);
}

console.log('\n=== 跟英語 θ / ð 比（距離越小越像）===');
const enTh = spec(EN['en think 的 θ']);
const enDh = spec(EN['en this 的 ð']);
const rows = [];
for (const [k, f] of Object.entries(ipaFeat)) {
  if (!f) continue;
  const dT = tv(f, enTh), dD = tv(f, enDh);
  rows.push({ k, dT, dD, cen: Math.round(f.centroid) });
}
console.log('  候選                  vs 英語θ   vs 英語ð    重心');
for (const r of rows.sort((a, b) => a.dT - b.dT)) {
  const mark = r.dT < 0.15 ? ' ★像θ' : r.dD < 0.15 ? ' ★像ð' : '';
  console.log(`  ${r.k.padEnd(20)} ${r.dT.toFixed(3).padStart(7)}  ${r.dD.toFixed(3).padStart(7)}   ${String(r.cen).padStart(4)} Hz${mark}`);
}

/* ---------- 生成「只含擦音」的對比 WAV ---------- */
const seq = [], names = [];
const push = (label, s) => { if (s && s.length) { seq.push(s); names.push(label); } };
push('en think θ', EN['en think 的 θ']);
push('ipa T', IPA['ipa [[ T ]]']);
push('ipa s[', IPA['ipa [[ s[ ]]']);
push('ipa s', IPA['ipa [[ s ]]']);
push('ipa f', IPA['ipa [[ f ]]']);
push('en this ð', EN['en this 的 ð']);
push('ipa D', IPA['ipa [[ D ]]']);
push('ipa z[', IPA['ipa [[ z[ ]]']);
push('ipa z', IPA['ipa [[ z ]]']);
push('ipa v', IPA['ipa [[ v ]]']);

const gap = Math.floor(SR * 0.35);
const total = seq.reduce((a, s) => a + s.length, 0) + gap * (seq.length - 1);
const out = new Float32Array(total);
let p = 0;
for (let i = 0; i < seq.length; i++) { out.set(seq[i], p); p += seq[i].length + gap; }
/* 正規化，免得大小聲差太多聽不出音色 */
let peak = 0; for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
if (peak > 0) for (let i = 0; i < out.length; i++) out[i] = out[i] / peak * 0.85;
fs.writeFileSync(path.join(OUT, 'fricative_only.wav'), Buffer.from(encodeWav(out, SR)));

console.log('\n=== 生成了純擦音對比 ===');
console.log('  fricative_only.wav  順序：');
names.forEach((n, i) => console.log(`    ${i + 1}. ${n}`));
console.log('  （已做音量正規化，只比音色）');
process.exit(0);
