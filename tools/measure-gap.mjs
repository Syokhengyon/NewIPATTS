/*
 * measure-gap.mjs — 量每个音节尾部的静音有多长，好设定字间间隔
 */
import { Speaker } from '../src/speak.mjs';
import { prepareBody } from '../src/ipa-espeak.mjs';

const SR = 22050;
const sp = await Speaker.create();
sp.voice = 'ipa+wide80';

/** 找尾部静音长度（从最后一个超过阈值的样本之后算起） */
function tailSilence(samples, thr = 0.005) {
  let last = 0;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (Math.abs(samples[i]) > thr) { last = i; break; }
  }
  return samples.length - 1 - last;
}
/** 找开头静音 */
function headSilence(samples, thr = 0.005) {
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > thr) return i;
  return samples.length;
}

console.log('音素串               總樣本  開頭靜音  尾部靜音   實發音');
for (const esp of ['tAk53 _:', 'nVm31 _:', 'then53 _:', 'tAk53', 'nVm31']) {
  const r = await sp._synthRaw(esp, 140);
  const h = headSilence(r.samples), t = tailSilence(r.samples);
  console.log(`  [[ ${esp.padEnd(14)} ]] ${String(r.n).padStart(6)}  ${String(h).padStart(7)}  ${String(t).padStart(7)}  ${String(r.n - h - t).padStart(7)}`);
}

console.log('\n=== 不同停頓的尾部靜音 ===');
for (const pause of ['_', '_|', '_!', '_:', '_::']) {
  const r = await sp._synthRaw(`tAk53 ${pause}`, 140);
  console.log(`  ${pause.padEnd(4)} 總 ${String(r.n).padStart(6)}  尾部靜音 ${String(tailSilence(r.samples)).padStart(6)}  (${(tailSilence(r.samples) / SR * 1000).toFixed(0)}ms)`);
}

console.log('\n=== 目前網頁/CLI 額外加的間隔 ===');
for (const ms of [60, 30, 20, 10, 0]) {
  console.log(`  ${String(ms).padStart(3)}ms = ${Math.round(SR * ms / 1000)} 樣本`);
}
process.exit(0);
