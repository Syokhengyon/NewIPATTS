/*
 * probe-phonemes.mjs — 用引擎自己的诊断信息判定音素名是否被接受
 *
 * 引擎对不认识的音素会打印：  bad phoneme <字符串>
 * 这比测时长可靠得多（时长是间接推断，会误判）。
 *
 * 输出 reference/ipa-table-accepted.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* 必须在载入引擎前接管 console，把引擎的诊断截下来 */
const captured = [];
const origLog = console.log, origWarn = console.warn, origErr = console.error;
const grab = (...a) => { captured.push(a.map(String).join(' ')); };
console.log = grab; console.warn = grab; console.error = grab;

const { Speaker } = await import('../src/speak.mjs');
const sp = await Speaker.create();
sp.voice = 'ipa';

/* 静默期结束后恢复输出 */
const say = (...a) => origLog(...a);

const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference', 'engine-phoneme-names.json'), 'utf8')).names;
const CAND = all.filter(n => n.length <= 6 && /^[\x20-\x7e]+$/.test(n) && n.trim() === n);
say(`候選 ${CAND.length} 個`);

const accepted = {}, rejected = {};
let i = 0;
for (const nm of CAND) {
  if (++i % 300 === 0) say(`  ... ${i}/${CAND.length}`);
  captured.length = 0;
  try { await sp._synthRaw(nm + 'a53', 140); } catch (e) { rejected[nm] = 'throw'; continue; }
  const bad = captured.filter(s => /bad phoneme/i.test(s));
  if (bad.length) rejected[nm] = bad[0].replace(/^bad phoneme\s*/, '').trim();
  else accepted[nm] = true;
}

console.log = origLog; console.warn = origWarn; console.error = origErr;

fs.writeFileSync(path.join(ROOT, 'reference', 'ipa-table-accepted.json'),
  JSON.stringify({ accepted: Object.keys(accepted).sort(), rejected }, null, 1), 'utf8');

say(`\n=== 結果 ===`);
say(`  引擎接受：${Object.keys(accepted).length}`);
say(`  引擎拒絕：${Object.keys(rejected).length}`);
say(`\n=== 我們關心的名字 ===`);
for (const nm of ['T', 'D', 'C', 'J^', 'H', 'P', 'M', 'B', 'F', 'G', 'R', 'K', 'U', 'J',
                  'l.', 'l#', 'l^', 't.', 'd.', 'n.', 's.', 'z.', 'S;', 'Z;', 'N', 'r"', 'Q"', 'g"',
                  'u', 'i', 'i"', 'u-', 'y"', 'a', 'A', 'A.', 'V', 'O', '@', '@;', '@.', '&', '&"']) {
  say(`  ${nm.padEnd(5)} ${accepted[nm] ? '✓ 接受' : '✗ 拒絕  ' + JSON.stringify(rejected[nm] ?? '')}`);
}
process.exit(0);
