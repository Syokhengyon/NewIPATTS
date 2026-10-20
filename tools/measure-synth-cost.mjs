/*
 * measure-synth-cost.mjs — 量「复用 worker」相对「每次 new」的差别
 *
 * 用真实的引擎句柄（openEngine），同一个 M 下对比两种做法。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEngine, SR } from '../src/engine.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = await openEngine(path.join(ROOT, 'engine'));
console.log('引擎已加载，采样率', M.eSpeakNGWorker ? SR : '?');

const TEXT = '[[ then53 _: ]]';
const N = 300;

function synth(w) {
  return new Promise(res => {
    let n = 0, settled = false;
    const done = () => { if (!settled) { settled = true; res(n); } };
    w.synthesize(TEXT, (d) => { if (!d || !d.length) { done(); return 0; } n += Math.floor(d.length / 2); return 0; });
    setTimeout(done, 3000);
  });
}

async function run(label, reuse, resetEvery) {
  const rss0 = process.memoryUsage().rss / 1048576;
  const t0 = Date.now();
  let total = 0;
  let w = null;
  if (reuse) {
    w = new M.eSpeakNGWorker();
    w.set_voice('ipa+wide80'); w.set_rate(140); w.set_pitch(40);
  }
  for (let i = 0; i < N; i++) {
    let cur = w;
    if (!reuse) {
      cur = new M.eSpeakNGWorker();
      cur.set_voice('ipa+wide80'); cur.set_rate(140); cur.set_pitch(40);
    } else if (resetEvery) {
      cur.set_rate(140); cur.set_voice('ipa+wide80'); cur.set_pitch(40);
    }
    total += await synth(cur);
    if (!reuse) { try { cur.delete(); } catch (e) {} }
  }
  if (w) { try { w.delete(); } catch (e) {} }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const rss1 = process.memoryUsage().rss / 1048576;
  console.log(`  ${label.padEnd(30)} ${dt.padStart(6)}s   RSS ${rss0.toFixed(0)}→${rss1.toFixed(0)} MB  (+${(rss1 - rss0).toFixed(0)})  樣本 ${total}`);
  return { dt: +dt, rss: rss1 - rss0 };
}

console.log(`\n各合成 ${N} 次：\n`);
const a = await run('每次 new worker（原 Node 做法）', false, false);
const b = await run('復用 worker，每字重設（原瀏覽器做法）', true, true);
const c = await run('復用 worker，設定只下一次（現在）', true, false);

console.log(`\n結論：`);
console.log(`  設定只下一次 比 每字重設   快 ${(b.dt / c.dt).toFixed(1)} 倍，內存少 ${(b.rss - c.rss).toFixed(0)} MB`);
console.log(`  設定只下一次 比 每次 new   快 ${(a.dt / c.dt).toFixed(1)} 倍，內存少 ${(a.rss - c.rss).toFixed(0)} MB`);
process.exit(0);
