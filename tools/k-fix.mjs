/*
 * k-fix.mjs — 测「元音加长音符号 + 塞音尾」能不能统一拉回时长
 *
 * 已知：+p/+t/+k 一律把音节压到约 61-62%（51 个元音实测）。
 * 现在测 V:k 能不能把保留率拉回 85% 以上，并且**代价可控**（音质变化小）。
 *
 * 三种方案：
 *   甲  Vk     现状
 *   乙  V:k    元音加长音符号
 *   丙  V k   加空格（分音节）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SR = 22050;
const { loadEngine } = await import(pathToFileURL(path.join(ROOT, 'src', 'engine.mjs')).href);
const { prepareBody } = await import(pathToFileURL(path.join(ROOT, 'src', 'ipa-espeak.mjs')).href);

const M = await loadEngine(path.join(ROOT, 'engine'));
const w = new M.eSpeakNGWorker();
w.set_voice('ipa');
w.set_rate(140);
w.set_pitch(40);

function synth(text) {
  const chunks = [];
  try {
    w.synthesize(text, (samples) => {
      if (!samples) return;
      const f = new Float32Array(samples.buffer || samples);
      const half = f.length >> 1;
      const a = new Float32Array(half);
      for (let i = 0; i < half; i++) a[i] = f[i * 2];
      chunks.push(a);
    });
  } catch (e) { return null; }
  let total = 0;
  for (const c of chunks) total += c.length;
  if (!total) return null;
  const s = new Float32Array(total);
  let p = 0;
  for (const c of chunks) { s.set(c, p); p += c.length; }
  return s;
}
const on = (s) => { for (let i = 0; i < s.length; i++) if (Math.abs(s[i]) > 0.008) return i; return 0; };
const off = (s) => { for (let i = s.length - 1; i >= 0; i--) if (Math.abs(s[i]) > 0.008) return i; return s.length; };
const vms = (s) => s ? ((off(s) - on(s)) / SR * 1000) : null;

const VOWELS = Array.from('iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ');

/* 只测能映射的单韵腹（双元音另算） */
const usable = [];
for (const v of VOWELS) {
  const prep = prepareBody(v, 'none');
  if (!prep.text || prep.dropped.length) continue;
  usable.push({ v, esp: prep.text });
}

console.log(`测 ${usable.length} 个单元音，韵尾用 /k/\n`);
console.log('=== 三种写法的时长 ===');
console.log('  IPA    裸ms    Vk     保留   V:k    保留   V k    保留');
const res = [];
for (const { v, esp } of usable) {
  const bare = vms(synth(`[[ ${esp}53 _: ]]`));
  const a = vms(synth(`[[ ${esp}k53 _: ]]`));
  const b = vms(synth(`[[ ${esp}:k53 _: ]]`));
  const c = vms(synth(`[[ ${esp} k53 _: ]]`));
  if (bare === null) continue;
  const pa = a ? a / bare * 100 : 0, pb = b ? b / bare * 100 : 0, pc = c ? c / bare * 100 : 0;
  console.log(`  ${v.padEnd(5)} ${bare.toFixed(0).padStart(5)}  ${String(a?.toFixed(0) ?? '—').padStart(5)}  ${pa.toFixed(0).padStart(4)}%  ${String(b?.toFixed(0) ?? '—').padStart(5)}  ${pb.toFixed(0).padStart(4)}%  ${String(c?.toFixed(0) ?? '—').padStart(5)}  ${pc.toFixed(0).padStart(4)}%`);
  res.push({ v, bare, a, b, c, pa, pb, pc });
}

const avg = (k) => res.reduce((a, r) => a + r[k], 0) / res.length;
console.log(`\n=== 平均保留率 ===`);
console.log(`  Vk   ${avg('pa').toFixed(0)}%`);
console.log(`  V:k  ${avg('pb').toFixed(0)}%`);
console.log(`  V k  ${avg('pc').toFixed(0)}%`);

/* 音质代价：V:k vs Vk 的频谱差异 */
function band(s, lo, hi) {
  let sum = 0, n = 0;
  for (let f = lo; f < hi; f += Math.max(40, (hi - lo) / 8)) {
    const k = 2 * Math.cos(2 * Math.PI * f / SR);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < s.length; i++) { const v = s[i] + k * s1 - s2; s2 = s1; s1 = v; }
    sum += Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2));
    n++;
  }
  return n ? sum / n : 0;
}
function profile(s, N = 10) {
  if (!s) return null;
  const a = on(s), b = off(s);
  const seg = s.subarray(a, b);
  const step = Math.max(1, Math.floor(seg.length / N));
  const out = [];
  for (let k = 0; k < N; k++) {
    const part = seg.subarray(k * step, (k + 1) * step);
    if (part.length < 80) { out.push(null); continue; }
    const lo = band(part, 250, 700), mid = band(part, 700, 1600), hi = band(part, 1600, 3200);
    const tot = lo + mid + hi || 1;
    out.push({ lo: lo / tot, mid: mid / tot, hi: hi / tot });
  }
  return out;
}
const dist = (p, q) => {
  if (!p || !q) return null;
  let s = 0, n = 0;
  for (let k = 0; k < p.length; k++) {
    if (!p[k] || !q[k]) continue;
    s += Math.abs(p[k].lo - q[k].lo) + Math.abs(p[k].mid - q[k].mid) + Math.abs(p[k].hi - q[k].hi);
    n++;
  }
  return n ? s / n : null;
};

console.log('\n=== 音质代价（与现状 Vk 比，<0.10 可接受）===');
let sumB = 0, sumC = 0, nb = 0, nc = 0;
for (const { v, esp } of usable) {
  const pk = profile(synth(`[[ ${esp}k53 _: ]]`));
  const pb = profile(synth(`[[ ${esp}:k53 _: ]]`));
  const pc = profile(synth(`[[ ${esp} k53 _: ]]`));
  const db = dist(pk, pb), dc = dist(pk, pc);
  if (db !== null) { sumB += db; nb++; }
  if (dc !== null) { sumC += dc; nc++; }
  if (['i', 'a', 'ɑ', 'ɨ', 'u', 'e', 'o'].includes(v)) {
    console.log(`  ${v.padEnd(4)}  V:k 差 ${db?.toFixed(3) ?? '—'}   V k 差 ${dc?.toFixed(3) ?? '—'}`);
  }
}
console.log(`  ─────────────────────────────`);
console.log(`  全部平均：V:k ${(sumB / nb).toFixed(3)}    V k ${(sumC / nc).toFixed(3)}`);
process.exit(0);
