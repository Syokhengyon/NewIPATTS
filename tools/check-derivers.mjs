/*
 * check-derivers.mjs — 校验 derivers/ 下所有推导方案能不能正常执行
 *
 * 用法：
 *   node tools/check-derivers.mjs            检查全部
 *   node tools/check-derivers.mjs 粵語 官話島  只检查指定文件（去掉 .txt）
 *
 * 为什么这么写：
 *   页面里推导器是用
 *     new Function('TshetUinh', '選項', '音韻地位', '字頭', source).bind(undefined, T)
 *   执行的 —— 四个自由变量：TshetUinh / 選項 / 音韻地位 / 字頭。
 *   所以校验必须**完全按这个方式**跑，否则会出现「测试报 選項 is not defined、
 *   但页面里其实正常」这种假失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- 载入 tshet-uinh（UMD，挂到 globalThis）---------- */
const loadUMD = (p) => { new Function(fs.readFileSync(p, 'utf8'))(); };
loadUMD(path.join(ROOT, 'node_modules', 'tshet-uinh', 'index.js'));
const T = globalThis.TshetUinh;
if (!T) { console.log('✗ tshet-uinh 载入失败'); process.exit(1); }
try { loadUMD(path.join(ROOT, 'node_modules', 'tshet-uinh-deriver-tools', 'dist', 'index.js')); } catch (e) {}
const DT = globalThis.TshetUinhDeriverTools;

/* ---------- 测试用字（覆盖各韵摄、开合、等、声调）---------- */
const SAMPLES = [
  ['天', '透開四先平'], ['地', '定開四脂去'], ['玄', '匣合四先平'], ['黃', '匣合一唐平'],
  ['宇', '云合三C虞上'], ['宙', '澄三尤去'], ['洪', '匣一東平'], ['荒', '曉合一唐平'],
  ['日', '日開三真入'], ['月', '疑合三C元入'], ['盈', '以開三清平'], ['昃', '莊開三蒸入'],
  ['人', '日開三真平'], ['工', '見一東平'], ['島', '端開一豪上'], ['鼻', '並三A脂去'],
  ['不', '幫三C尤平'], ['為', '云合三B支平'], ['兄', '曉合三B庚平'], ['橫', '見合一唐平'],
  ['知', '知開三支平'], ['章', '章開三陽平'], ['莊', '莊開三陽平'], ['子', '精開三之平'],
];

/* ---------- 按页面方式编译 ---------- */
function compile(source) {
  try {
    return new Function('TshetUinh', '選項', '音韻地位', '字頭', source).bind(undefined, T);
  } catch (e) {
    return { err: e.message };
  }
}

function runDeriver(rawFn, pos, 字頭, 選項) {
  try { return { out: rawFn(選項, pos, 字頭) }; }
  catch (e) { return { err: e.message }; }
}

/* ---------- 主流程 ---------- */
const only = process.argv.slice(2);
const files = fs.readdirSync(path.join(ROOT, 'derivers'))
  .filter(f => f.endsWith('.txt'))
  .filter(f => !only.length || only.includes(f.replace(/\.txt$/, '')));

console.log(`检查 ${files.length} 个推导方案${only.length ? '（' + only.join(', ') + '）' : ''}`);
console.log(`  tshet-uinh: ${T ? '✓' : '✗'}   deriver-tools: ${DT ? '✓' : '（未载入）'}\n`);

let totalOk = 0, totalBad = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, 'derivers', f), 'utf8');
  const name = f.replace(/\.txt$/, '');
  console.log(`=== ${f}  ${(src.length / 1024).toFixed(1)} KB  ${src.split('\n').length} 行 ===`);

  const fn = compile(src);
  if (fn.err) { console.log(`  ✗ 编译失败: ${fn.err}\n`); totalBad++; continue; }

  /* ① 取选项列表（页面靠这一步渲染设置项）*/
  let opts = null;
  const r0 = runDeriver(fn, null, null, {});
  if (r0.err) console.log(`  ✗ 取选项失败: ${r0.err}`);
  else {
    opts = r0.out;
    const n = Array.isArray(opts) ? opts.length : 0;
    console.log(`  ✓ 选项 ${n} 个` + (n && n[0] && n[0][0] !== undefined ? `：${n.slice(0, 6).map(o => o[0]).join(' ')}${n.length > 6 ? ' …' : ''}` : ''));
    /* 检查枚举项格式（页面需要 {key,value} 或 [label, options]）*/
    if (Array.isArray(opts)) {
      const bad = opts.filter(o => !Array.isArray(o) || o.length < 2);
      if (bad.length) console.log(`    ⚠ ${bad.length} 个选项格式可疑: ${JSON.stringify(bad.slice(0, 3))}`);
    }
  }

  /* ② 取默认选项值（页面会填进 方案選項）*/
  const 方案選項 = {};
  if (Array.isArray(opts)) {
    for (const o of opts) {
      if (!Array.isArray(o)) continue;
      /* 页面逻辑：o 是 [key, 默认值] 或 [key, [枚举...]] */
      if (o.length >= 2 && typeof o[0] === 'string') {
        const v = o[1];
        if (Array.isArray(v) && v.length && Array.isArray(v[0])) 方案選項[o[0]] = v[0][0];   // 枚举：取第一项
        else if (Array.isArray(v) && v.length && typeof v[0] === 'string') 方案選項[o[0]] = v[0];
        else 方案選項[o[0]] = v;
      }
    }
  }

  /* ③ 逐字推导 */
  let ok = 0, bad = 0;
  const fails = [];
  for (const [字, 描述] of SAMPLES) {
    let pos;
    try { pos = T.音韻地位.from描述(描述); }
    catch (e) { fails.push(`${字}(${描述}) 地位解析失败: ${e.message}`); bad++; continue; }
    const r = runDeriver(fn, pos, 字, 方案選項);
    if (r.err) { fails.push(`${字}(${描述}) → ${r.err}`); bad++; continue; }
    /* 页面逻辑：返回字符串或 [IPA, ...]，空则算失败 */
    const out = Array.isArray(r.out) ? r.out[0] : r.out;
    if (typeof out !== 'string' || !out.trim()) { fails.push(`${字}(${描述}) → 输出为空`); bad++; continue; }
    ok++;
  }
  const pct = ((ok / SAMPLES.length) * 100).toFixed(0);
  console.log(`  ${bad === 0 ? '✓' : '△'} 推导 ${ok}/${SAMPLES.length} 成功 (${pct}%)`);
  if (fails.length) {
    console.log(`    失败样例：`);
    for (const x of fails.slice(0, 4)) console.log(`      ${x}`);
    if (fails.length > 4) console.log(`      … 还有 ${fails.length - 4} 个`);
  }
  if (bad === 0) totalOk++; else totalBad++;
  console.log('');
}

console.log(`=== 汇总 ===`);
console.log(`  ✓ 完全通过 ${totalOk} 个`);
console.log(`  △ 有问题   ${totalBad} 个`);
process.exitCode = totalBad ? 1 : 0;
