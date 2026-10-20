/*
 * audio.mjs — 音頻小工具（無任何 Node 依賴，Node 與瀏覽器共用）
 */

/** 静音判定阈值 */
export const SILENCE_THR = 0.004;

/**
 * 裁掉首尾靜音。
 *
 * 為什麼需要：引擎每塊輸出都自帶很長的首尾靜音。實測 [[ tAk53 _: ]]：
 *     總 17036 樣本   頭部靜音 1033   尾部靜音 13999（635ms）   實際發音 2004
 * 逐音節拼接時這些靜音會累加，字與字之間就出現約 0.7 秒的空檔，
 * 聽起來「字與字隔得太長」。實測裁剪後 4.68s → 1.57s。
 *
 * @param {Float32Array} samples
 * @param {{headMs?:number, tailMs?:number, sr?:number}} [opts]
 *   headMs / tailMs 是要保留的自然起音與衰減餘量
 */
export function trimSilence(samples, opts = {}) {
  const sr = opts.sr ?? 22050;
  const n = samples.length;
  if (!n) return samples;
  let a = 0;
  while (a < n && Math.abs(samples[a]) <= SILENCE_THR) a++;
  if (a >= n) return samples.subarray(0, 0);          // 整段都是靜音
  let b = n - 1;
  while (b > a && Math.abs(samples[b]) <= SILENCE_THR) b--;
  const from = Math.max(0, a - Math.round(sr * (opts.headMs ?? 6) / 1000));
  const to = Math.min(n, b + 1 + Math.round(sr * (opts.tailMs ?? 18) / 1000));
  return samples.subarray(from, to);
}

/** 把若干段音頻用固定間隔拼起來 */
export function mergeWithGap(segments, gapMs = 45, sr = 22050) {
  const gap = new Float32Array(Math.round(sr * gapMs / 1000));
  const parts = [];
  for (const s of segments) {
    if (!s || !s.length) continue;
    if (parts.length && gap.length) parts.push(gap);
    parts.push(s);
  }
  let n = 0;
  parts.forEach(p => n += p.length);
  const out = new Float32Array(n);
  let off = 0;
  parts.forEach(p => { out.set(p, off); off += p.length; });
  return out;
}

/** Float32 样本 → 16 位 WAV（ArrayBuffer），浏览器与 Node 都能用 */
export function encodeWav(samples, sr = 22050) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, n * 2, true);
  let mx = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(samples[i]); if (a > mx) mx = a; }
  const g = mx > 0.99 ? 0.99 / mx : 1;
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i] * g)) * 32767, true);
  }
  return buf;
}
