/*
 * probe-voice-tables.mjs — 哪个语音的音素表能用我们的音素输入？
 *
 * 已知：
 *   · en 语音念 "think" → 好的 θ（重心 3459Hz，人耳確認）
 *   · ipa 语音 [[ T ]]  → 重心 957Hz，不是 θ
 *   · ipa 语音 [[ s[ ]] → 重心 4017Hz，最接近英語 θ（d=0.276）
 *
 * 之前 en + [[ t ]] 失控過，但那可能是 worker 被弄髒之後的連鎖反應。
 * 這次**每次合成都用全新 worker**，重測一遍。
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

function synth(voice, text, cap = SR * 4) {
  return new Promise(res => {
    const w = new M.eSpeakNGWorker();
    try { w.set_voice(voice); } catch (e) { res({ err: 'set_voice: ' + e.message }); return; }
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
function onset(s, t = 0.01) { for (let i = 0; i < s.length; i++) if (Math.abs(s[i]) > t) return i; return s.length; }
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

/* 英語 θ 作基準 */
const enTh = spec(head((await synth('en', 'think')).s, 70));
const enDh = spec(head((await synth('en', 'this')).s, 70));
console.log(`英語 θ 重心 ${Math.round(enTh.centroid)} Hz    ð 重心 ${Math.round(enDh.centroid)} Hz\n`);

const VOICES = ['ipa', 'en', 'en-us', 'gmw/en', 'base'];
console.log('=== 各語音下 [[ t a ]] 是否被當音素解析 ===');
console.log('語音       樣本數     判定');
for (const v of VOICES) {
  const r = await synth(v, '[[ t a _: ]]');
  if (r.err) { console.log(`  ${v.padEnd(8)} —          set_voice 失敗`); continue; }
  const n = r.s ? r.s.length : 0;
  const runaway = r.capped;
  console.log(`  ${v.padEnd(8)} ${String(n).padStart(8)}   ${runaway ? '★ 失控（被當文本讀）' : '正常解析'}`);
}

console.log('\n=== 各語音下 θ 候選的重心（對比英語 θ）===');
console.log('語音       音素    重心Hz   與英語θ距離');
const rows = [];
for (const v of ['ipa', 'en', 'en-us', 'base']) {
  for (const ph of ['T', 'D', 's[', 's']) {
    const r = await synth(v, `[[ ${ph} a _: ]]`);
    if (r.err || !r.s || r.capped) { continue; }
    /* 取開頭擦音段 */
    const f = spec(head(r.s, 70));
    if (!f) continue;
    /* 前 70ms 可能含元音，改用孤立音重測 */
    const r2 = await synth(v, `[[ ${ph} _: ]]`);
    const f2 = r2.s && !r2.capped ? spec(head(r2.s, 90)) : null;
    const use = f2 || f;
    let d = 1;
    if (use) { let acc = 0; for (let i = 0; i < NB; i++) acc += Math.abs(use.v[i] - enTh.v[i]); d = acc / 2; }
    rows.push({ v, ph, cen: Math.round(use.centroid), d });
    console.log(`  ${v.padEnd(8)} ${ph.padEnd(6)} ${String(Math.round(use.centroid)).padStart(6)}   ${d.toFixed(3)}`);
  }
}
const best = rows.filter(r => r.d < 0.45).sort((a, b) => a.d - b.d).slice(0, 5);
console.log('\n最像英語 θ 的：');
best.forEach(r => console.log(`  ${r.v} + ${r.ph}   d=${r.d.toFixed(3)}  重心 ${r.cen} Hz`));
process.exit(0);
