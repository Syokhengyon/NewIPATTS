/*
 * check-collisions.mjs — 找出转写表里「多个 IPA 指向同一音素名」的碰撞
 *
 * 碰撞意味着引擎分不开这两个音 —— 听感上就是「跟别的混了」。
 */
import {
  IPA_TO_ESPEAK, IPA_TO_ESPEAK_AUTHOR, IPA_TO_ESPEAK_EXT, OVERRIDES, EXT_CAVEATS,
} from '../src/ipa-espeak.mjs';

const byName = new Map();
for (const [ipa, esp] of Object.entries(IPA_TO_ESPEAK)) {
  if (!esp) continue;
  if (!byName.has(esp)) byName.set(esp, []);
  byName.get(esp).push(ipa);
}

const mine = new Set(Object.keys(IPA_TO_ESPEAK_EXT));
const coll = [...byName.entries()].filter(([, list]) => list.length > 1);

console.log(`=== 碰撞：${coll.length} 個音素名被多個 IPA 共用 ===\n`);
console.log('音素名   涉及的 IPA                      我加的?  已有備註');
let introduced = 0;
for (const [esp, list] of coll.sort((a, b) => b[1].length - a[1].length)) {
  const hasMine = list.some(i => mine.has(i) || i in OVERRIDES);
  if (hasMine) introduced++;
  const cav = list.map(i => EXT_CAVEATS[i]).filter(Boolean).join(' / ');
  console.log(`  ${esp.padEnd(7)} ${list.join(' ').padEnd(30)} ${hasMine ? '★ 是' : '  否'}     ${cav}`);
}

console.log(`\n其中 ${introduced} 個涉及我新增/覆蓋的條目`);
console.log(`\n=== 全部 ${byName.size} 個音素名，${Object.keys(IPA_TO_ESPEAK).length} 個 IPA ===`);
