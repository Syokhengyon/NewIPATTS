/*
 * check-page-ids.mjs — 核对页面元素 id，并**模拟模块求值**找出会中断的语句
 *
 * 教训：字面量 $('x') 的检查不够 —— 拼接出来的 $(id+'Val') 也会取到 null，
 * 抛 TypeError 后模块求值中断，后面所有绑定失效，表现为「按钮点了没反应」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const file of ['web/derive.html', 'web/chart.html', 'web/index.html']) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  console.log(`\n${'='.repeat(64)}\n${file}\n${'='.repeat(64)}`);

  const defined = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  const mod = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!mod) { console.log('  （无 module 脚本）'); continue; }
  const src = mod[1];

  /* 1. 字面量引用 */
  const lit = new Set([...src.matchAll(/\$\('([^']+)'\)|getElementById\('([^']+)'\)/g)]
    .map(m => m[1] ?? m[2]));
  const missLit = [...lit].filter(id => !defined.has(id));

  /* 2. 拼接引用：找 $(id + 'X') / $(`${id}X`) 之类 */
  const concat = [];
  for (const m of src.matchAll(/\$\(\s*\w+\s*\+\s*'([^']+)'\s*\)/g)) concat.push(m[0]);
  for (const m of src.matchAll(/\$\(\s*`\$\{[^}]+\}([^`]*)`\s*\)/g)) concat.push(m[0]);

  console.log(`  HTML 定义 ${defined.size} 个 id；字面量引用 ${lit.size} 个`);
  if (missLit.length) {
    console.log(`  ✗ 字面量缺失：${missLit.join(' ')}`);
  } else console.log('  ✓ 字面量引用全部存在');

  if (concat.length) {
    console.log(`  ⚠ 发现 ${concat.length} 处拼接 id，需人工核对：`);
    [...new Set(concat)].forEach(s => console.log(`      ${s}`));
  }

  /* 3. 静态找出「可能取到 null」的赋值链 */
  const risky = [];
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    /* $('x').prop = 形式，且 x 不在 defined 里 */
    const m = l.match(/\$\('([^']+)'\)\.(\w+)\s*=/);
    if (m && !defined.has(m[1])) risky.push(`行${i + 1}: $('${m[1]}').${m[2]} = …`);
    /* $(id + 'Val') 形式 */
    if (/\$\(\s*\w+\s*\+\s*'[^']*'\s*\)/.test(l)) risky.push(`行${i + 1}: 拼接 id —— ${l.trim().slice(0, 80)}`);
  });
  if (risky.length) {
    console.log(`  ⚠ 可能取到 null 的地方：`);
    risky.forEach(r => console.log('      ' + r));
  }

  /* 4. 语法 */
  try { new Function(src.replace(/^import .*$/gm, '')); console.log('  ✓ 语法正确'); }
  catch (e) { console.log('  ✗ 语法错误：' + e.message); }
}
