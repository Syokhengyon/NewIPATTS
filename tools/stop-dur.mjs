/*
 * stop-dur.mjs — 量所有塞音尾（-p -t -k）韵母的时长
 *
 * 上一轮漏了塞音尾：我直接从 並非官話.txt 的 `韻母規則()` 里提取字面量，
 * 但入聲的塞音尾**不在字面量裏** —— 它是執行時把鼻音尾換掉的：
 *     if (is('入聲')) {
 *       if (韻母.endsWith('m')) 韻母 = 韻母.slice(0,-1) + 'p';
 *       else if (韻母.endsWith('n')) 韻母 = 韻母.slice(0,-1) + 't';
 *       else if (韻母.endsWith('ŋ')) 韻母 = 韻母.slice(0,-1) + 'k';
 *     }
 *
 * 所以 ɑk 来自 ɑŋ、ik 来自 iŋ、uɨt 来自 uɨn ……
 * 这一轮按这个映射逐个量，和对应的鼻音尾、以及不带尾的元音做对照。
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
const onset = (s, thr = 0.008) => { for (let i = 0; i < s.length; i++) if (Math.abs(s[i]) > thr) return i; return 0; };
const offset = (s, thr = 0.008) => { for (let i = s.length - 1; i >= 0; i--) if (Math.abs(s[i]) > thr) return i; return s.length; };
const vms = (s) => s ? ((offset(s) - onset(s)) / SR * 1000) : null;

/** 由推导器的规则生成塞音尾 */
function toStop(f) {
  if (f.endsWith('m')) return f.slice(0, -1) + 'p';
  if (f.endsWith('n')) return f.slice(0, -1) + 't';
  if (f.endsWith('ŋ')) return f.slice(0, -1) + 'k';
  return null;
}

/* 推导器里出现的全部鼻音尾韵母 */
const NASAL = ['am', 'em', 'im', 'ɨm', 'iem',
  'an', 'en', 'in', 'ɨn', 'ien', 'uɨn', 'yen',
  'ɑŋ', 'eŋ', 'iŋ', 'ɨŋ', 'oŋ', 'ioŋ', 'iɑŋ', 'uɑŋ', 'uɨŋ', 'yɑŋ'];

console.log('=== 塞音尾 vs 鼻音尾 vs 无尾 的时长对照 ===');
console.log('  鼻音尾   時長   塞音尾   時長    差額     韻腹');
const rows = [];
for (const n of NASAL) {
  const st = toStop(n);
  if (!st) continue;
  const pn = prepareBody(n, 'none'), ps = prepareBody(st, 'none');
  if (!pn.text || pn.dropped.length || !ps.text || ps.dropped.length) {
    console.log(`  ${n.padEnd(7)} ✗ ${JSON.stringify([...pn.dropped, ...ps.dropped])}`);
    continue;
  }
  const dn = vms(synth(`[[ ${pn.text}53 _: ]]`));
  const ds = vms(synth(`[[ ${ps.text}53 _: ]]`));
  const diff = (dn !== null && ds !== null) ? ds - dn : null;
  /* 韵腹：去掉最后一个字母 */
  const nuc = st.slice(0, -1);
  const flag = ds < 130 ? ' ★★ 很短' : ds < 160 ? ' ★ 偏短' : '';
  console.log(`  ${n.padEnd(7)} ${String(dn?.toFixed(0) ?? '—').padStart(5)}  ${st.padEnd(7)} ${String(ds?.toFixed(0) ?? '—').padStart(5)}  ${String(diff?.toFixed(0) ?? '—').padStart(6)}   /${nuc}/${flag}`);
  rows.push({ n, st, dn, ds, diff, nuc });
}

/* ---------- 按韵尾分组 ---------- */
console.log('\n=== 按塞音尾分组的平均时长 ===');
const g = {};
for (const r of rows) (g[r.st.slice(-1)] = g[r.st.slice(-1)] || []).push(r.ds);
for (const [c, ds] of Object.entries(g).sort()) {
  const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
  console.log(`  -${c}  ${String(ds.length).padStart(2)} 个   平均 ${avg.toFixed(0).padStart(4)} ms   范围 ${Math.min(...ds).toFixed(0)}–${Math.max(...ds).toFixed(0)}`);
}

/* ---------- 按韵腹分组（找哪些韵腹 + 塞音尾特别短）---------- */
console.log('\n=== 同一韵腹：鼻音尾 vs 塞音尾 vs 无尾 ===');
const byNuc = {};
for (const r of rows) (byNuc[r.nuc] = byNuc[r.nuc] || []).push(r);
for (const [nuc, list] of Object.entries(byNuc)) {
  const bare = prepareBody(nuc, 'none');
  const db = bare.text && !bare.dropped.length ? vms(synth(`[[ ${bare.text}53 _: ]]`)) : null;
  const nas = list.map(r => `${r.n}=${r.dn?.toFixed(0)}`).join(' ');
  const stp = list.map(r => `${r.st}=${r.ds?.toFixed(0)}`).join(' ');
  console.log(`  /${nuc.padEnd(4)}/  無尾 ${db?.toFixed(0) ?? '—'}   鼻尾 ${nas}   塞尾 ${stp}`);
}

/* ---------- 最短的排序 ---------- */
console.log('\n=== 塞音尾韵母按时长排序（最短在前）===');
rows.sort((a, b) => a.ds - b.ds);
for (const r of rows) {
  const flag = r.ds < 130 ? ' ★★ 很短' : r.ds < 160 ? ' ★ 偏短' : r.ds < 190 ? ' △' : '';
  console.log(`  ${r.st.padEnd(7)} ${String(r.ds.toFixed(0)).padStart(4)} ms   (鼻音尾 ${r.n} ${r.dn?.toFixed(0)}ms，差 ${r.diff?.toFixed(0)})${flag}`);
}
process.exit(0);
