/*
 * check-deriver-env.mjs — 探明推導器的完整執行環境（四個變數）
 *
 * 權威依據：tshet-uinh-deriver-tools 的 README
 *   new Function("TshetUinh", "選項 = {}", "音韻地位", "字頭 = null", 方案代碼)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* 1. deriver-tools 的模块格式 */
const dtPath = path.join(ROOT, 'node_modules', 'tshet-uinh-deriver-tools', 'dist', 'index.js');
const dt = fs.readFileSync(dtPath, 'utf8');
console.log('=== tshet-uinh-deriver-tools/dist/index.js ===');
console.log(`  大小 ${(dt.length / 1024).toFixed(1)} KB`);
console.log(`  首 120 字符: ${JSON.stringify(dt.slice(0, 120))}`);
for (const [n, re] of [['module.exports', /module\.exports/], ['exports.', /\bexports\./],
  ['require(', /require\(/], ['顶层 import', /(?:^|\n)\s*import\s/], ['global 赋值', /global\./],
  ['process/fs', /process\.|\bfs\./]]) {
  console.log(`  ${re.test(dt) ? '有' : '无'}  ${n}`);
}
console.log(`  导出名: ${[...dt.matchAll(/exports\.([A-Za-z_$\u4e00-\u9fff][\w$\u4e00-\u9fff]*)\s*=/g)].map(m => m[1]).join(' ')}`);

/* 2. 浏览器式加载测试 */
console.log('\n=== 浏览器式加载 deriver-tools ===');
try {
  new Function(dt)();
  const g = Object.keys(globalThis).filter(k => /推導|deriver/i.test(k));
  console.log('  globalThis 上的相关导出:', g.join(' ') || '（无）');
} catch (e) { console.log('  ✗', e.message.slice(0, 80)); }

/* 3. 用 Node require 看导出 */
console.log('\n=== Node require 导出 ===');
const mod = require('tshet-uinh-deriver-tools');
console.log('  ' + Object.keys(mod).join(' '));

/* 4. 实测四个变量 */
console.log('\n=== 推導器的四个自由变量 ===');
const SRC = `
  if (!音韻地位) return [['前綴','d'], ['高級選項', false]];
  return (選項.前綴 || '?') + ':' + 字頭 + ':' + (typeof TshetUinh) + ':' + 音韻地位.描述;
`;
const fn = new Function('TshetUinh', '選項', '音韻地位', '字頭', SRC);
new Function(fs.readFileSync(path.join(ROOT, 'node_modules', 'tshet-uinh', 'index.js'), 'utf8'))();
const T = globalThis.TshetUinh;

console.log('  元資料呼叫（音韻地位=null）:', JSON.stringify(fn(T, {}, null, null)));
const pos = T.音韻地位.from描述('幫三C凡入');
console.log('  推導呼叫（選項={}）        :', JSON.stringify(fn(T, {}, pos, '凡')));
console.log('  推導呼叫（選項={前綴:"X"}）:', JSON.stringify(fn(T, { 前綴: 'X' }, pos, '凡')));

/* 5. 用 deriver-tools 的 推導方案 包裝 */
console.log('\n=== 用 推導方案 包裝 ===');
try {
  const 原始 = new Function('TshetUinh', '選項', '音韻地位', '字頭', SRC).bind(undefined, T);
  const 方案 = new mod.推導方案(原始);
  console.log('  方案設定():', JSON.stringify(方案.方案設定()));
  const 推導 = 方案();
  console.log('  預設推導  :', 推導(pos, '凡'));
  const 推導2 = 方案({ 前綴: 'Z' });
  console.log('  指定選項  :', 推導2(pos, '凡'));
} catch (e) { console.log('  ✗', e.message.slice(0, 120)); }
