/*
 * install-variant.mjs — 把自訂嗓音變體烘焙進引擎的 .data
 *
 * 為什麼需要：瀏覽器裡引擎跑在 Worker 中，主線程拿不到 FS_createDataFile，
 *             所以變體不能運行時創建，只能事先打包進去。
 *
 * 做法：Emscripten 的 .data 是「純拼接」，文件清單（filename/start/end）在 .js 裡。
 *       所以在 .data 末尾追加內容，再往清單加一條記錄即可，不必改動既有偏移。
 *
 * 用法: node tools/install-variant.mjs [變體名] ["pitch 80 255"]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'engine', 'espeakng.worker.js');
const DATA = path.join(ROOT, 'engine', 'espeakng.worker.data');

const name = process.argv[2] || 'wide80';
const pitchLine = process.argv[3] || 'pitch 80 255';
const fname = '/usr/local/share/espeak-ng-data/voices/!v/' + name;

let js = fs.readFileSync(JS, 'utf8');
let data = fs.readFileSync(DATA);

if (js.includes('"' + fname + '"')) {
  console.log(`變體 ${name} 已存在，跳過。`);
  process.exit(0);
}

/* 檢查 remote_package_size */
const mSize = js.match(/"remote_package_size":(\d+)/);
if (!mSize) { console.error('找不到 remote_package_size'); process.exit(1); }
const oldSize = parseInt(mSize[1], 10);
if (oldSize !== data.length) {
  console.error(`警告：清單裡的 remote_package_size=${oldSize}，但 .data 實際 ${data.length} 位元組`);
}

/* 追加內容（確保結尾有換行） */
const content = Buffer.from(`language variant\nname ${name}\n${pitchLine}\n`, 'utf8');
const start = data.length;
const end = start + content.length;
const newData = Buffer.concat([data, content]);

/* 往清單末尾插入一條（插在 ],"remote_package_size" 之前） */
const anchor = '],"remote_package_size"';
const idx = js.indexOf(anchor);
if (idx < 0) { console.error('找不到清單結尾 anchor'); process.exit(1); }
const entry = `,{"filename":"${fname}","start":${start},"end":${end}}`;
js = js.slice(0, idx) + entry + js.slice(idx);

/* 更新總大小 */
js = js.replace(/"remote_package_size":\d+/, '"remote_package_size":' + end);

fs.writeFileSync(DATA, newData);
fs.writeFileSync(JS, js);

console.log(`已安裝變體 ${name}`);
console.log(`  內容: ${JSON.stringify(content.toString('utf8'))}`);
console.log(`  偏移: ${start} ~ ${end}（${content.length} 位元組）`);
console.log(`  .data: ${data.length} -> ${newData.length}`);
console.log(`  呼叫方式: set_voice('ipa+${name}')`);
