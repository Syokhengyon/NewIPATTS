/*
 * scan-for-th.mjs — 在 ipa 语音里暴力搜「最像英语 θ / ð」的音素
 *
 * 前面幾條路都堵住了：
 *   · en 語音不接受 [[ ]] 音素輸入
 *   · 變體裏寫 `phonemes en` 不生效
 *   · ipa 語音的 [[ T ]] 重心 855Hz，英語 θ 是 3459Hz，根本不是同一個音
 *
 * 那就別猜了 —— 把候選符號全掃一遍，按頻譜相似度排序。
 * 英語 θ / ð 的頻譜當基準（人耳已確認它們是對的）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEngine } from '../src/engine.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = await openEngine(path.join(ROOT, 'engine'));
console.error = () => {};
const SR = 22050;

function synth(voice, text, cap = SR * 3) {
  return new Promise(res => {
    const w = new M.eSpeakNGWorker();
    try { w.set_voice(voice); } catch (e) { return res({ err: 1 }); }
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

/* 基準：英語 θ / ð（人耳確認過是對的） */
const enTh = spec(head((await synth('en', 'think')).s, 70));
const enDh = spec(head((await synth('en', 'this')).s, 70));
console.log(`基準：英語 θ 重心 ${Math.round(enTh.centroid)} Hz    ð 重心 ${Math.round(enDh.centroid)} Hz\n`);

/* 候選：我們用到的全部 + 一堆可能相關的組合 */
const m = await import('../src/ipa-espeak.mjs');
const merged = { ...m.IPA_TO_ESPEAK_EXT, ...m.IPA_TO_ESPEAK_AUTHOR, ...m.OVERRIDES };
const used = [...new Set(Object.values(merged).filter(v => v && v !== '?'))];
const EXTRA = ['T', 'D', 'T[', 'D[', 't[', 'd[', 'F', 'V', 'P', 'B', 'ss', 'S', 'Z', 'C',
  's[', 'z[', 's.', 'z.', 'S;', 'Z;', 'f[', 'v[', 'th', 'th.', 'fh.', 'sh.', 'zh.',
  'tS', 'dZ', 'ts', 'dz', 'ts.', 'dz.', 'tS;', 'dZ;', '4', 'r', 'r.', 'R', 'r"', 'G'];
const ALL = [...new Set([...used, ...EXTRA])].filter(x => /^[\x21-\x7e]{1,6}$/.test(x));
console.log(`掃 ${ALL.length} 個候選符號…\n`);

const rows = [];
for (const ph of ALL) {
  const r = await synth('ipa', `[[ ${ph} _: ]]`);
  if (!r.s || r.capped || r.s.length < 500) continue;
  const f = spec(head(r.s, 90));
  if (!f) continue;
  rows.push({ ph, cen: Math.round(f.centroid), dT: tv(f, enTh), dD: tv(f, enDh), len: r.s.length });
}

const byT = [...rows].sort((a, b) => a.dT - b.dT).slice(0, 15);
const byD = [...rows].sort((a, b) => a.dD - b.dD).slice(0, 15);

console.log('=== 最像英語 θ 的 15 個（基準重心 3459 Hz）===');
console.log('  符號      重心Hz   距離θ   距離ð');
for (const r of byT) console.log(`  ${r.ph.padEnd(8)} ${String(r.cen).padStart(5)}   ${r.dT.toFixed(3)}   ${r.dD.toFixed(3)}${r.dT < 0.15 ? '  ★★' : r.dT < 0.25 ? '  ★' : ''}`);

console.log('\n=== 最像英語 ð 的 15 個（基準重心 841 Hz）===');
console.log('  符號      重心Hz   距離ð   距離θ');
for (const r of byD) console.log(`  ${r.ph.padEnd(8)} ${String(r.cen).padStart(5)}   ${r.dD.toFixed(3)}   ${r.dT.toFixed(3)}${r.dD < 0.15 ? '  ★★' : r.dD < 0.25 ? '  ★' : ''}`);

/* 存一份完整結果 */
fs.writeFileSync(path.join(ROOT, 'reference', 'th-scan.json'),
  JSON.stringify({ 英語θ重心: Math.round(enTh.centroid), 英語ð重心: Math.round(enDh.centroid), rows }, null, 1), 'utf8');
console.log(`\n完整結果（${rows.length} 個符號）寫到 reference/th-scan.json`);

const bestT = byT[0], bestD = byD[0];
console.log(`\n結論：`);
console.log(`  θ 最佳候選 ${bestT.ph}（重心 ${bestT.cen} Hz，距離 ${bestT.dT.toFixed(3)}）`);
console.log(`  ð 最佳候選 ${bestD.ph}（重心 ${bestD.cen} Hz，距離 ${bestD.dD.toFixed(3)}）`);
process.exit(0);
