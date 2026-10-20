/*
 * swap-site-engine.mjs — 替換站點副本使用的 espeak 引擎文件
 *
 * 用法:
 *   node tools/swap-site-engine.mjs              查看當前狀態
 *   node tools/swap-site-engine.mjs backup       把當前引擎備份到 js-bak/
 *   node tools/swap-site-engine.mjs restore      從 js-bak/ 還原
 *   node tools/swap-site-engine.mjs from <目錄>   用 <目錄> 下的引擎文件替換
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site-copy');
const CUR = path.join(SITE, 'js');
const BAK = path.join(SITE, 'js-bak');
const FILES = ['espeakng.worker.js', 'espeakng.worker.data'];

const mb = f => (fs.existsSync(f) ? (fs.statSync(f).size / 1048576).toFixed(2) + ' MB' : '（缺）');
const show = (label, dir) => {
  console.log(`  ${label}`);
  for (const f of FILES) console.log(`    ${f.padEnd(24)} ${mb(path.join(dir, f))}`);
};

const cmd = process.argv[2] || 'status';

if (cmd === 'status') {
  console.log('\n=== 站點副本的 espeak 引擎 ===');
  show('site-copy/js/（當前使用）', CUR);
  if (fs.existsSync(BAK)) show('site-copy/js-bak/（備份）', BAK);
  else console.log('  site-copy/js-bak/ 不存在（尚未備份）');
  console.log('\n注：這兩支文件只決定「引擎能發出什麼聲音」，');
  console.log('    不決定「IPA 怎麼映射成音素名」—— 後者在 duyin-web_bg.wasm 裏。\n');
}

else if (cmd === 'backup') {
  fs.mkdirSync(BAK, { recursive: true });
  for (const f of FILES) {
    const s = path.join(CUR, f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(BAK, f));
  }
  console.log('已備份到 site-copy/js-bak/');
  show('js-bak/', BAK);
}

else if (cmd === 'restore') {
  if (!fs.existsSync(BAK)) { console.error('沒有備份可還原'); process.exit(1); }
  for (const f of FILES) {
    const s = path.join(BAK, f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(CUR, f));
  }
  console.log('已還原');
  show('js/', CUR);
}

else if (cmd === 'from') {
  const src = process.argv[3];
  if (!src || !fs.existsSync(src)) { console.error('用法: from <目錄>'); process.exit(1); }
  if (!fs.existsSync(BAK)) { fs.mkdirSync(BAK, { recursive: true }); for (const f of FILES) { const s = path.join(CUR, f); if (fs.existsSync(s)) fs.copyFileSync(s, path.join(BAK, f)); } console.log('（已自動備份原引擎到 js-bak/）'); }
  let n = 0;
  for (const f of FILES) {
    const s = path.join(src, f);
    if (fs.existsSync(s)) { fs.copyFileSync(s, path.join(CUR, f)); n++; console.log(`  替換 ${f}`); }
  }
  if (!n) console.error('該目錄下沒有找到引擎文件');
  else { console.log('完成，重新整理頁面即可'); show('js/', CUR); }
}

else { console.error('用法: status | backup | restore | from <目錄>'); process.exit(1); }
