/*
 * compare-phonemes.mjs — 可靠地判断两个音素是否真的不同
 *
 * 前两次測量都錯了：
 *   ① 只用振幅包絡 → 清濁、頻譜差異全丟
 *   ② 取信號中段 → 輔音短、後面接 `_:` 停頓，中段幾乎全零
 * 這次用：
 *   · 滑動窗找**能量最高**的 30ms（加 Hamming 窗）
 *   · 24 段對數頻帶濾波器組（100Hz–8kHz，Goertzel）
 *   · 頻譜包絡正規化後算總變差距離
 * 對響音、擦音、塞擦音都適用（真塞音另說，本清單裏沒有）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEngine } from '../src/engine.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SR = 22050;
const M = await openEngine(path.join(ROOT, 'engine'));
console.error = () => {};

const w = new M.eSpeakNGWorker();
w.set_voice('ipa'); w.set_rate(140); w.set_pitch(40);

function synth(ph) {
  return new Promise(res => {
    const chunks = []; let n = 0, done = false;
    const fin = () => {
      if (done) return; done = true;
      const s = new Float32Array(n); let p = 0;
      for (const c of chunks) { s.set(c, p); p += c.length; }
      res(s);
    };
    try {
      w.synthesize(`[[ ${ph} _: ]]`, (d) => {
        if (!d || !d.length) { fin(); return 0; }
        const half = Math.floor(d.length / 2);
        const a = new Float32Array(half);
        for (let i = 0; i < half; i++) a[i] = d[i * 2];
        chunks.push(a); n += half; return 0;
      });
    } catch (e) { fin(); return; }
    setTimeout(fin, 2000);
  });
}

/* 24 段對數頻帶 */
const NB = 24;
const F0 = 100, F1 = 8000;
const BANDS = [];
for (let i = 0; i < NB; i++) {
  const lo = F0 * Math.pow(F1 / F0, i / NB);
  const hi = F0 * Math.pow(F1 / F0, (i + 1) / NB);
  BANDS.push((lo + hi) / 2);
}

function goertzel(s, f) {
  const k = 2 * Math.cos(2 * Math.PI * f / SR);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < s.length; i++) { const s0 = s[i] + k * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / s.length;
}

/** 取能量最高的 30ms 窗，加 Hamming 窗 */
function bestWindow(s) {
  if (!s || s.length < 600) return null;
  const win = Math.min(661, s.length);            // 30 ms @22.05k
  let best = 0, bestE = -1;
  const hop = 55;
  for (let i = 0; i + win <= s.length; i += hop) {
    let e = 0;
    for (let j = i; j < i + win; j++) e += s[j] * s[j];
    if (e > bestE) { bestE = e; best = i; }
  }
  if (bestE <= 0) return null;
  const out = new Float32Array(win);
  for (let j = 0; j < win; j++) {
    out[j] = s[best + j] * (0.54 - 0.46 * Math.cos(2 * Math.PI * j / (win - 1)));
  }
  return { w: out, rms: Math.sqrt(bestE / win), at: best, n: s.length };
}

function feat(s) {
  const bw = bestWindow(s);
  if (!bw || bw.rms < 1e-4) return null;
  const ps = BANDS.map(f => goertzel(bw.w, f));
  const sum = ps.reduce((a, b) => a + b, 0) || 1;
  const spec = ps.map(p => p / sum);
  let num = 0;
  for (let i = 0; i < NB; i++) num += BANDS[i] * spec[i];
  return { spec, centroid: num, rms: bw.rms, n: s.length, voicedAt: bw.at };
}

/** 總變差距離（0 = 完全相同，1 = 完全不同） */
const tv = (a, b) => {
  if (!a || !b) return 1;
  let d = 0;
  for (let i = 0; i < a.spec.length; i++) d += Math.abs(a.spec[i] - b.spec[i]);
  return d / 2;
};

const cache = new Map();
async function F(ph) {
  if (cache.has(ph)) return cache.get(ph);
  const f = feat(await synth(ph));
  cache.set(ph, f);
  return f;
}

/* ============ 測你列的每一條 ============ */
const GROUPS = [
  ['θ/ð 與 s/z/f（你說「不像英語 th」）', [
    ['θ=s[', 's['], ['θ=?', 's'], ['ð=z[', 'z['], ['ð=?', 'z'],
    ['s[ vs s（是否退化）', null],   // 特殊處理
  ]],
  ['邊音（你說「除 l 外全不能區分」）', [
    ['l', 'l'], ['ʎ=l^', 'l^'], ['ɭ=l.', 'l.'], ['ʟ=L[', 'L['],
    ['l̥=lh', 'lh'], ['ɫ=?', 'l'], ['ɺ=?', 'r'],
  ]],
  ['塞擦音（你說 dʑ dʐ 全混）', [
    ['d͡ʑ=dZ;', 'dZ;'], ['d͡ʐ=dz.', 'dz.'], ['d͡z=dz', 'dz'],
    ['tɕ=S;?', 'S;'], ['tʂ=ts.', 'ts.'],
  ]],
  ['近音（你說 ɹ ɻ ɰ 共用 r.）', [
    ['ɹ=r.', 'r.'], ['ɻ=?', 'r.'], ['ɰ=?', 'r.'], ['r.', 'r'],
  ]],
  ['ʋ / v（你說幾乎不能分）', [['ʋ=v.', 'v.'], ['v', 'v'], ['β=u-', 'u-']]],
  ['鼻音（你說 ŋ ɴ 幾乎不能分）', [
    ['ŋ=N', 'N'], ['ɴ=n"', 'n"'], ['ɲ=ȵ=n^', 'n^'], ['n', 'n'], ['n.', 'n.'],
  ]],
];

console.log('【逐個量基準音】');
const ALL = ['s[', 's', 'z[', 'z', 'f', 'T', 'D',
  'l', 'l^', 'l.', 'L[', 'lh', 'L',
  'dZ;', 'dz.', 'dz', 'S;', 'ts.', 'ts',
  'r.', 'r', 'R',
  'v.', 'v', 'u-', 'B',
  'N', 'n"', 'n^', 'n', 'n.', 'J'];
for (const ph of ALL) {
  const f = await F(ph);
  console.log(`  ${ph.padEnd(6)} ${f ? `重心 ${String(Math.round(f.centroid)).padStart(4)}Hz  RMS ${f.rms.toFixed(3)}  樣本 ${String(f.n).padStart(6)}` : '★ 無輸出/無能量'}`);
}

console.log('\n【兩兩距離】(0=相同, 1=完全不同；<0.05 可視為同一個音)');
const PAIRS = [];
for (const [title, rows] of GROUPS) {
  for (const [label, ph] of rows) {
    if (!ph) continue;
    PAIRS.push([label, ph]);
  }
}
/* 直接把「問題對」列出來 */
const Q = [
  ['θ(s[) vs s', 's[', 's'], ['θ(s[) vs f', 's[', 'f'], ['θ(s[) vs T', 's[', 'T'],
  ['ð(z[) vs z', 'z[', 'z'], ['ð(z[) vs D', 'z[', 'D'],
  ['l vs ʎ(l^)', 'l', 'l^'], ['l vs ɭ(l.)', 'l', 'l.'],
  ['ʎ(l^) vs ɭ(l.)', 'l^', 'l.'], ['ʎ(l^) vs ʟ(L[)', 'l^', 'L['],
  ['ɭ(l.) vs ʟ(L[)', 'l.', 'L['], ['l vs ʟ(L[)', 'l', 'L['], ['l vs l̥(lh)', 'l', 'lh'],
  ['d͡ʑ(dZ;) vs d͡ʐ(dz.)', 'dZ;', 'dz.'], ['d͡ʑ(dZ;) vs d͡z(dz)', 'dZ;', 'dz'],
  ['d͡ʐ(dz.) vs d͡z(dz)', 'dz.', 'dz'], ['d͡ʑ(dZ;) vs tɕ(S;)', 'dZ;', 'S;'],
  ['ɹ/ɻ/ɰ(r.) vs r', 'r.', 'r'], ['ɹ/ɻ/ɰ(r.) vs ʀ(r")', 'r.', 'R'],
  ['ʋ(v.) vs v', 'v.', 'v'], ['ʋ(v.) vs β(u-)', 'v.', 'u-'], ['v vs β(u-)', 'v', 'u-'],
  ['ŋ(N) vs ɴ(n")', 'N', 'n"'], ['ŋ(N) vs ɲ(n^)', 'N', 'n^'],
  ['ɴ(n") vs ɲ(n^)', 'n"', 'n^'], ['ŋ(N) vs n', 'N', 'n'], ['ɳ(n.) vs ɲ(n^)', 'n.', 'n^'],
];
for (const [label, a, b] of Q) {
  const d = tv(await F(a), await F(b));
  const tag = d < 0.02 ? '★ 完全相同' : d < 0.05 ? '★ 幾乎相同' : d < 0.12 ? '接近但可分' : d < 0.25 ? '可分' : '明顯不同';
  console.log(`  ${label.padEnd(26)} d=${d.toFixed(3)}  ${tag}`);
}

console.log('\n【候選替代：有沒有更好的】');
const ALT = {
  'θ 的候選': ['s[', 'T', 'f', 't[', 'T[', 'F', '4'],
  'ð 的候選': ['z[', 'D', 'v', 'd[', 'D[', 'V'],
  'ʎ 的候選': ['l^', 'L', 'L[', 'J', 'j'],
  'ɭ 的候選': ['l.', 'l', 'L', 'r.'],
  'ʟ 的候選': ['L[', 'L', 'l.', 'l^'],
  'ɹ/ɻ/ɰ 的候選': ['r.', 'r', 'R', 'l', 'j', 'w'],
  'ʋ 的候選': ['v.', 'v', 'B', 'u-', 'w'],
  'ɴ 的候選': ['n"', 'N', 'n^', 'J', 'n.'],
};
for (const [title, cands] of Object.entries(ALT)) {
  const out = [];
  for (const c of cands) {
    const f = await F(c);
    out.push(`${c}${f ? `(${Math.round(f.centroid)})` : '(無)'}`);
  }
  console.log(`  ${title.padEnd(16)} ${out.join('  ')}`);
}
process.exit(0);
