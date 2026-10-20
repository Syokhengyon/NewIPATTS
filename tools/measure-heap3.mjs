/*
 * measure-heap3.mjs — 正确测量 WASM 堆耗尽点
 *
 * 关键：必须校验「真的收到了音频」。
 * abort 之后引擎已死，后续 synthesize 静默无输出 ——
 * 不校验的话会把「空转」误当成「跑得很好」（上一版就是这么被骗的）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEngine } from '../src/engine.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = path.join(ROOT, 'engine');

const realLog = console.log.bind(console);
console.error = () => {}; console.warn = () => {};

const S = ['[[ then53 _: ]]', '[[ d.i"w212 _: ]]', '[[ J^uA.N31 _: ]]',
  '[[ ȵit2 _: ]]', '[[ ts.i"k5 _: ]]', '[[ bh.a53 _: ]]'];

/** 合成一次，返回收到的样本数；0 表示引擎没给数据 */
function synth(w, text) {
  return new Promise(res => {
    let got = 0, done = false;
    const fin = () => { if (!done) { done = true; res(got); } };
    try {
      w.synthesize(text, (d) => { if (d && d.length) got += Math.floor(d.length / 2); return 0; });
    } catch (e) { fin(); return; }
    setTimeout(fin, 1500);
  });
}

/* ---------- ① 不重启，找到真正失效的点 ---------- */
realLog('\n=== ① 不重啟 Worker ===');
realLog('   次數    本次樣本   堆MB');
{
  const M = await openEngine(ENGINE);
  const w = new M.eSpeakNGWorker();
  w.set_voice('ipa+wide80'); w.set_rate(140); w.set_pitch(40);
  let firstZero = -1;
  for (let n = 1; n <= 4000; n++) {
    const got = await synth(w, S[n % S.length]);
    if (got === 0 && firstZero < 0) firstZero = n;
    if (n <= 20 || n % 250 === 0 || (firstZero > 0 && n <= firstZero + 3)) {
      realLog(`  ${String(n).padStart(5)}  ${String(got).padStart(9)}  ${(M.HEAPU8.length / 1048576).toFixed(1)}`);
    }
    if (firstZero > 0 && n > firstZero + 3) break;
  }
  realLog(firstZero > 0
    ? `  ★ 第 ${firstZero} 次起引擎不再输出 —— WASM 堆耗盡`
    : `  跑完 4000 次仍正常`);
}

/* ---------- ② 定期重建 Worker ---------- */
for (const every of [500, 1000]) {
  realLog(`\n=== ② 每 ${every} 次重建 Worker ===`);
  let M = await openEngine(ENGINE);
  let w = new M.eSpeakNGWorker();
  w.set_voice('ipa+wide80'); w.set_rate(140); w.set_pitch(40);
  let fail = -1, restarts = 0;
  for (let n = 1; n <= 4000; n++) {
    const got = await synth(w, S[n % S.length]);
    if (got === 0) { fail = n; break; }
    if (n % every === 0) {
      try { w.delete(); } catch (e) {}
      M = await openEngine(ENGINE);          // 整個 Module 重建 = 新堆
      w = new M.eSpeakNGWorker();
      w.set_voice('ipa+wide80'); w.set_rate(140); w.set_pitch(40);
      restarts++;
    }
  }
  realLog(fail > 0
    ? `  ★ 第 ${fail} 次仍然失效（重建了 ${restarts} 次）—— 重建间隔不够`
    : `  ✓ 跑完 4000 次正常，重建 ${restarts} 次`);
}
process.exit(0);
