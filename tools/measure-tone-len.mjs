/*
 * measure-tone-len.mjs — 量不同调值的时长，找压缩办法
 */
import { Speaker } from '../src/speak.mjs';
import { trimSilence } from '../src/audio.mjs';

const SR = 22050;
const sp = await Speaker.create();
sp.voice = 'ipa+wide80';

/** 自相关基频估计（取中段有声音的部分） */
function f0(samples, sr = SR) {
  const N = 1024, hop = 256;
  const out = [];
  for (let off = 0; off + N < samples.length; off += hop) {
    let e = 0;
    for (let i = 0; i < N; i++) e += samples[off + i] * samples[off + i];
    if (Math.sqrt(e / N) < 0.02) continue;
    let best = 0, bestLag = 0;
    const lo = Math.floor(sr / 400), hi = Math.floor(sr / 60);
    for (let lag = lo; lag <= hi; lag++) {
      let s = 0;
      for (let i = 0; i < N - lag; i++) s += samples[off + i] * samples[off + i + lag];
      s /= (N - lag);
      if (s > best) { best = s; bestLag = lag; }
    }
    if (bestLag) out.push(sr / bestLag);
  }
  if (out.length < 3) return null;
  out.sort((a, b) => a - b);
  const med = out[out.length >> 1];
  const keep = out.filter(f => Math.abs(f - med) / med < 0.5);
  return {
    n: keep.length,
    min: Math.round(Math.min(...keep)),
    max: Math.round(Math.max(...keep)),
    med: Math.round(med),
  };
}

const NAMES = ['31', '313', '53', '535', '24', '213', '33', '5', '2'];
const RATES = [140, 168, 196, 224, 252];

console.log('=== 各調值在不同語速下的時長（裁剪後）與基頻範圍 ===');
console.log('調值   速率   樣本    時長ms    F0 min/max/中位   跨度(半音)');
const rows = {};
for (const t of NAMES) {
  for (const rate of RATES) {
    const r = await sp._synthRaw(`a${t}53`.replace(/53$/, ''), rate);
    const tr = trimSilence(r.samples, { sr: SR });
    const ms = Math.round(tr.length / SR * 1000);
    const f = f0(tr);
    const span = f ? (12 * Math.log2(f.max / f.min)).toFixed(2) : '?';
    if (!rows[t]) rows[t] = [];
    rows[t].push({ rate, n: tr.length, ms, f, span });
    console.log(`  ${t.padEnd(5)} ${String(rate).padStart(4)}  ${String(tr.length).padStart(6)}  ${String(ms).padStart(6)}   ${f ? `${f.min}/${f.max}/${f.med}` : '—'}   ${span}`);
  }
  console.log('');
}

console.log('=== 對比：2 位調 vs 3 位調（同速率）===');
for (const rate of RATES) {
  const a = rows['31'].find(x => x.rate === rate);
  const b = rows['313'].find(x => x.rate === rate);
  const c = rows['53'].find(x => x.rate === rate);
  const d = rows['535'].find(x => x.rate === rate);
  console.log(`  速率 ${String(rate).padStart(3)}:  31=${String(a.ms).padStart(4)}ms  313=${String(b.ms).padStart(4)}ms (${(b.ms / a.ms).toFixed(2)}×)   |   53=${String(c.ms).padStart(4)}ms  535=${String(d.ms).padStart(4)}ms (${(d.ms / c.ms).toFixed(2)}×)`);
}

console.log('\n=== 找：3 位調用多高速率才與 2 位調（rate 140）等長 ===');
const target31 = rows['31'].find(x => x.rate === 140).ms;
const target53 = rows['53'].find(x => x.rate === 140).ms;
console.log(`  目標：31 → ${target31}ms，53 → ${target53}ms`);
for (const t of ['313', '535', '213', '423']) {
  const cand = rows[t] ? rows[t].filter(x => x.ms <= (t === '313' || t === '213' ? target31 : target53) * 1.1) : [];
  if (!cand.length) { console.log(`  ${t}: 測過的速率都不夠快`); continue; }
  const best = cand[0];
  console.log(`  ${t}  → 建議 rate ${best.rate}（${best.ms}ms，跨度 ${best.span} 半音）`);
}
process.exit(0);
