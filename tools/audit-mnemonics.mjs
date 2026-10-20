/*
 * audit-mnemonics.mjs — 检查我们用的每个 espeak 音素名是否真的能发声
 *
 * ⚠ 判据必須用**上下文**，不能用孤立音：
 *   清塞音 p t k 孤立時就是「靜默 + 極短的爆破」，
 *   孤立測會把它們判成「無輸出」，那是假警報。
 *   所以一律測 `[[ <音素> a _: ]]`，再跟純 `a` 比。
 *   m n 這類鼻音孤立時樣本反而比停頓**少**（把停頓截短了），
 *   拿「樣本數變多」當判據也會誤判。
 *   可靠的判據是：**加了這個音素之後，波形有沒有變化**。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEngine } from '../src/engine.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = await openEngine(path.join(ROOT, 'engine'));
console.error = () => {};

const w = new M.eSpeakNGWorker();
w.set_voice('ipa'); w.set_rate(140); w.set_pitch(40);

function synth(text) {
  return new Promise(res => {
    const chunks = []; let n = 0, done = false;
    const fin = () => {
      if (done) return; done = true;
      const s = new Float32Array(n); let p = 0;
      for (const c of chunks) { s.set(c, p); p += c.length; }
      res(s);
    };
    try {
      w.synthesize(text, (d) => {
        if (!d || !d.length) { fin(); return 0; }
        const half = Math.floor(d.length / 2);
        const a = new Float32Array(half);
        for (let i = 0; i < half; i++) a[i] = d[i * 2];
        chunks.push(a); n += half; return 0;
      });
    } catch (e) { fin(); return; }
    setTimeout(fin, 2500);
  });
}

/** 波形差異：長度差 + 逐點差（對齊後取較短長度） */
function diff(a, b) {
  const L = Math.min(a.length, b.length);
  let acc = 0, e = 0;
  for (let i = 0; i < L; i++) { acc += Math.abs(a[i] - b[i]); e += Math.abs(b[i]); }
  const shape = e > 0 ? acc / e : (a.length ? 1 : 0);
  const lenDiff = Math.abs(a.length - b.length) / Math.max(1, b.length);
  return { shape, lenDiff, changed: shape > 0.02 || lenDiff > 0.02 };
}

const m = await import('../src/ipa-espeak.mjs');
const merged = { ...m.IPA_TO_ESPEAK_EXT, ...m.IPA_TO_ESPEAK_AUTHOR, ...m.OVERRIDES };
const rev = {};
for (const [ipa, esp] of Object.entries(merged)) {
  if (!esp || esp === '?') continue;
  (rev[esp] ||= []).push(ipa);
}
const names = Object.keys(rev).sort();
console.log(`檢查 ${names.length} 個助記符（上下文：[[ <音素> a _: ]] 對比 [[ a _: ]]）\n`);

const base = await synth('[[ a _: ]]');
console.log(`基準 [[ a _: ]]：${base.length} 樣本\n`);

const bad = [], weak = [], ok = [];
for (const ph of names) {
  const s = await synth(`[[ ${ph} a _: ]]`);
  const d = diff(s, base);
  let peak = 0;
  for (let i = 0; i < s.length; i++) { const v = Math.abs(s[i]); if (v > peak) peak = v; }
  const rec = { ph, n: s.length, peak, ...d };
  if (!d.changed) bad.push(rec);
  else if (s.length < base.length * 0.6 || peak < 0.01) weak.push(rec);
  else ok.push(rec);
}

const show = (r) => `  ${r.ph.padEnd(8)} 樣本 ${String(r.n).padStart(6)}  峰值 ${r.peak.toFixed(4)}  波形差 ${(r.shape * 100).toFixed(1)}%  長度差 ${(r.lenDiff * 100).toFixed(1)}%`;

console.log(`=== ★ 加了等於沒加（${bad.length} 個）—— 映射到這些就是靜默失敗 ===`);
for (const b of bad) console.log(show(b) + `   ← ${rev[b.ph].join(' ')}`);

console.log(`\n=== ⚠ 明顯異常（${weak.length} 個）===`);
for (const q of weak) console.log(show(q) + `   ← ${rev[q.ph].join(' ')}`);

console.log(`\n=== ✓ 正常（${ok.length} 個）===`);
const cols = 8;
for (let i = 0; i < ok.length; i += cols) {
  console.log('  ' + ok.slice(i, i + cols).map(o => o.ph.padEnd(7)).join(''));
}
console.log(`\n合計：正常 ${ok.length} / 異常 ${weak.length} / 失效 ${bad.length}`);
process.exit(bad.length ? 1 : 0);
