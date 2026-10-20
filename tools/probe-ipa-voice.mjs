/*
 * probe-ipa-voice.mjs — 看 ipa 语音是怎么定义的
 *
 * 关键问题：是什么让 ipa 语音接受 `[[ ]]` 音素输入？
 *   · 如果是语音文件里的一个标志，而音素表是**另一个字段**，
 *     那就能造一个「用 en 音素表 + 保留音素输入」的语音。
 *   · 如果两者绑死，就只能改 phontab。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const table = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference', 'espeak-fs', '_filetable.json'), 'utf8'));
const data = fs.readFileSync(path.join(ROOT, 'engine', 'espeakng.worker.data'));

console.log('=== 名字裏有 ipa 的文件 ===');
for (const f of table) {
  if (/ipa/i.test(f.filename)) {
    const b = data.subarray(f.start, f.end);
    console.log(`\n--- ${f.filename}  (${b.length} 位元組) ---`);
    console.log(b.toString('utf8').replace(/\r/g, ''));
  }
}

console.log('\n=== voices 目錄下所有非 !v 的語音 ===');
for (const f of table) {
  if (/\/voices\/[^/]+$/.test(f.filename)) {
    console.log(`  ${f.filename}  (${f.end - f.start})`);
  }
}

console.log('\n=== 對照：一個普通語音（en） ===');
const en = table.find(f => f.filename.endsWith('/lang/gmw/en'));
if (en) {
  console.log(`--- ${en.filename} ---`);
  console.log(data.subarray(en.start, en.end).toString('utf8').replace(/\r/g, ''));
}

console.log('\n=== wide80 變體（我們實際用的） ===');
const w80 = table.find(f => f.filename.endsWith('!v/wide80'));
if (w80) {
  console.log(data.subarray(w80.start, w80.end).toString('utf8').replace(/\r/g, ''));
}
