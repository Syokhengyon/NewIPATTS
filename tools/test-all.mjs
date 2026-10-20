/*
 * test-all.mjs — 跑全部测试
 *
 * 用法: node tools/test-all.mjs [--quick]
 *   --quick  略過需要合成音頻的（較慢）
 *
 * 注意：沙箱禁止用管道捕獲子進程輸出（Node 的 spawn 用 stdio:'pipe' 會 EPERM），
 *       所以這裏用 stdio:'inherit' 讓子進程直接寫終端，判定只看**退出碼**。
 *       因此各測試腳本必須以 process.exit(0/1) 收尾。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');

/* [脚本, 说明, 是否需要合成（慢）] */
const SUITES = [
  ['verify-table.mjs',       '對照表結構（作者原表、碰撞、來源）',        false],
  ['verify-derive-page.mjs', '頁面邏輯（四變數、設定項、音素轉寫、拼接）', true],
  ['test-page-clicks.mjs',   '頁面交互（按鈕、多音字、顯示開關）',        false],
  ['test-annotated.mjs',     '括號注音（固定讀音、補全類別、標點）',      false],
  ['test-paragraph.mjs',     '標點停頓、分段、單段朗讀、定時器泄漏',      true],
  ['test-longtext.mjs',      '長文本（3387 字）不 OOM、不並行朗讀',       true],
  ['test-readings-io.mjs',   'txt 匯入匯出、改讀音寫回原文、引擎重建',    true],
  ['test-fallback.mjs',      '類推與三色（補充字表、異體字、簡化字）',    false],
  /* 這一項需要真實伺服器在跑 —— 它測檔案系統寫入，用樁測不出白名單是否生效 */
  ['test-save.mjs',          '/api/save：只寫 texts/ derivers/、可覆蓋',  false],
  ['check-page-ids.mjs',     '頁面元素 id 完整性',                      false],
  ['check-chart.mjs',        '音素表頁面',                              false],
  ['check-collisions.mjs',   '音素名碰撞',                              false],
  ['check-multireading.mjs', '多音字',                                  false],
  ['check-deriver-api.mjs',  '推導器 API',                              false],
  ['check-nasal.mjs',        '鼻化元音',                                true],
  ['check-aspirate.mjs',     '送氣（ʰ / ʱ）',                           true],
];

console.log('\n' + '='.repeat(60));
console.log(`  IPA 讀音合成 — 全部測試${quick ? '（快速模式）' : ''}`);
console.log('='.repeat(60) + '\n');

const results = [];
for (const [script, desc, slow] of SUITES) {
  const p = path.join(ROOT, 'tools', script);
  const label = script.replace(/\.mjs$/, '').padEnd(24);
  if (!fs.existsSync(p)) { console.log(`  ${label} —     不存在：${script}`); results.push([script, null]); continue; }
  if (slow && quick) { console.log(`  ${label} —     略過（快速模式）`); results.push([script, null]); continue; }

  console.log(`  ${label} ▶     ${desc}`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [p], { cwd: ROOT, stdio: 'inherit' });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = r.status === 0;
  console.log(`  ${label} ${ok ? '✓' : '✗'}     ${dt}s\n`);
  results.push([script, ok]);
}

const done = results.filter(([, r]) => r !== null);
const pass = done.filter(([, r]) => r).length;
const fail = done.length - pass;
const skip = results.length - done.length;

console.log('='.repeat(60));
console.log(`  通過 ${pass} / 失敗 ${fail}${skip ? ` / 略過 ${skip}` : ''}`);
if (fail) {
  console.log('  失敗項：');
  results.filter(([, r]) => r === false).forEach(([s]) => console.log('    ✗ ' + s));
}
console.log('='.repeat(60) + '\n');

process.exit(fail ? 1 : 0);
