/*
 * k-quant.mjs — 量化「元音 + /k/」的时长变化
 *
 * 目的：统一测出所有能发的元音在加上 /k/ 韵尾后的时长变化，
 *       看这个缩短是普遍的还是只发生在某些元音上。
 *
 * 上一轮已知（个案）：
 *   裸 ɨ = 169ms，ɨk = 73ms   → 少了 96ms
 *   裸 i = 169ms，ik = 74ms   → 少了 95ms
 *   裸 a = 208ms，ak = 93ms   → 少了 115ms
 * 都缩得很厉害。这一轮把全部元音都测一遍，确认规律。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SR = 22050;
const { loadEngine } = await import(pathToFileURL(path.join(ROOT, 'src', 'engine.mjs')).href);
const { IPA_TO_ESPEAK, prepareBody } = await import(pathToFileURL(path.join(ROOT, 'src', 'ipa-espeak.mjs')).href);

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

/* ---------- 收集所有能发的元音 ---------- */
const VOWELS = Array.from('iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ');

/* 从映射表里筛选：键是单个元音字符，或者以元音开头且全是元音（双元音） */
const candidates = new Set(VOWELS);
/* 再加上映射表里的双元音（两个元音字符组成） */
for (const k of Object.keys(IPA_TO_ESPEAK)) {
  if (k.length === 2 && [...k].every(c => VOWELS.includes(c))) candidates.add(k);
}

const usable = [];
for (const v of [...candidates].sort()) {
  const prep = prepareBody(v, 'none');
  if (!prep.text || prep.dropped.length) continue;
  usable.push({ v, esp: prep.text });
}
console.log(`可用元音 ${usable.length} 个（含双元音）\n`);

/* ---------- 逐个测「裸」和「+k」 ---------- */
console.log('=== 元音 + /k/ 的时长变化 ===');
console.log('  IPA   音素串    裸ms    +k ms    差額     保留率   判定');
const rows = [];
for (const { v, esp } of usable) {
  const bare = vms(synth(`[[ ${esp}53 _: ]]`));
  const withK = vms(synth(`[[ ${esp}k53 _: ]]`));
  if (bare === null || withK === null) {
    console.log(`  ${v.padEnd(5)} ${esp.padEnd(9)} ${String(bare?.toFixed(0) ?? '—').padStart(5)}  ${String(withK?.toFixed(0) ?? '—').padStart(6)}    量不到`);
    continue;
  }
  const delta = withK - bare;
  const keep = bare > 0 ? (withK / bare * 100) : 0;
  const flag = keep < 50 ? '★★ 严重缩短' : keep < 70 ? '★ 明显缩短' : keep < 85 ? '△ 略短' : '✓ 正常';
  console.log(`  ${v.padEnd(5)} ${esp.padEnd(9)} ${bare.toFixed(0).padStart(5)}  ${withK.toFixed(0).padStart(6)}  ${(delta > 0 ? '+' : '') + delta.toFixed(0)}`.padEnd(36) + `${keep.toFixed(0).padStart(4)}%   ${flag}`);
  rows.push({ v, esp, bare, withK, delta, keep });
}

/* ---------- 汇总 ---------- */
rows.sort((a, b) => a.keep - b.keep);
console.log('\n=== 按时长保留率排序（最短的在前）===');
for (const r of rows) {
  console.log(`  ${r.v.padEnd(5)} 保留 ${String(r.keep.toFixed(0)).padStart(3)}%   ${r.bare.toFixed(0)} → ${r.withK.toFixed(0)} ms  (${r.delta > 0 ? '+' : ''}${r.delta.toFixed(0)})`);
}

const avgKeep = rows.reduce((a, r) => a + r.keep, 0) / rows.length;
const worst = rows[0], best = rows[rows.length - 1];
console.log(`\n=== 统计 ===`);
console.log(`  ${rows.length} 个元音，平均保留率 ${avgKeep.toFixed(0)}%`);
console.log(`  最短：${worst.v}  ${worst.bare.toFixed(0)} → ${worst.withK.toFixed(0)} ms（保留 ${worst.keep.toFixed(0)}%）`);
console.log(`  最长：${best.v}  ${best.bare.toFixed(0)} → ${best.withK.toFixed(0)} ms（保留 ${best.keep.toFixed(0)}%）`);
const sev = rows.filter(r => r.keep < 50), mid = rows.filter(r => r.keep >= 50 && r.keep < 70), ok = rows.filter(r => r.keep >= 70);
console.log(`  保留率 < 50%（严重）：${sev.length} 个  ${sev.map(r => r.v).join(' ')}`);
console.log(`  50–70%（明显）：      ${mid.length} 个  ${mid.map(r => r.v).join(' ')}`);
console.log(`  ≥ 70%（尚可）：       ${ok.length} 个  ${ok.map(r => r.v).join(' ')}`);

/* ---------- 对照：+n 和 +t ---------- */
console.log('\n=== 对照：+n / +t 的平均保留率（看塞音尾是不是特例）===');
for (const coda of ['n', 'm', 'N', 'p', 't', 'k', 'j', 'w']) {
  let sum = 0, n = 0;
  for (const { v, esp } of usable) {
    const bare = vms(synth(`[[ ${esp}53 _: ]]`));
    const withC = vms(synth(`[[ ${esp}${coda}53 _: ]]`));
    if (bare && withC) { sum += withC / bare; n++; }
  }
  if (n) console.log(`  +${coda.padEnd(2)} ${String(n).padStart(3)} 个   平均保留 ${(sum / n * 100).toFixed(0)}%`);
}
process.exit(0);
