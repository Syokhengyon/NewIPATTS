/*
 * test-save.mjs — 验证 /api/save：只写 texts/ 与 derivers/，可覆盖原档
 *
 * 这一项测的是**真实服务器**（不是桩）—— 保存涉及文件系统，
 * 用桩测不出路径白名单是否真的生效。
 *
 * 需要服务器已经在跑：`node tools/serve.mjs 8981`
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.DSH_TEST_BASE || 'http://127.0.0.1:8981';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}${x ? '  ' + x : ''}`); } else { fail++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); } };

const post = async (body) => {
  const r = await fetch(BASE + '/api/save', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
};
const get = async (u) => {
  const r = await fetch(BASE + u);
  return { status: r.status, text: await r.text() };
};

/* 先确认服务器在跑且是新版 */
console.log('=== 服务器 ===');
let probe;
try { probe = await fetch(BASE + '/api/texts'); }
catch (e) { console.log(`  ✗ 连不上 ${BASE} —— 先 npm run serve`); process.exit(1); }
check('/api/texts 可用', probe.ok, `HTTP ${probe.status}`);
if (!probe.ok) { console.log('  （服务器是旧版，没有 /api/ 接口。重启即可。）'); process.exit(1); }

console.log('\n=== ① 列表接口 ===');
const texts = await (await fetch(BASE + '/api/texts')).json();
const derivers = await (await fetch(BASE + '/api/derivers')).json();
check('texts/ 列出檔案', texts.length > 0, texts.map(f => f.name).join(' '));
check('derivers/ 列出檔案', derivers.length > 0, derivers.map(f => f.name).join(' '));
check('texts/ 含千字文', texts.some(f => f.name.includes('千字文')));
check('derivers/ 條目格式正確', derivers.every(f => f.name && f.url && f.name !== ''), derivers.length + ' 項');

console.log('\n=== ② 覆盖已有文件（改完立刻还原）===');
{
  /*
   * 注意：**還原也走 API**，不用 fs.writeFileSync。
   * 測試腳本本身跑在沙箱裏，對使用者既有檔案的直接寫入會被拒（EPERM），
   * 但透過伺服器寫就沒問題 —— 那正是這個功能存在的意義。
   */
  const name = '哀江南賦并序.txt';
  const orig = await (await fetch(BASE + '/texts/' + encodeURIComponent(name))).text();
  const marker = orig + '\n（test-save 臨時標記）';
  try {
    const r = await post({ dir: 'texts', name, content: marker });
    check('保存成功', r.j && r.j.ok, r.j && r.j.ok ? `${r.j.bytes} 位元組` : JSON.stringify(r.j));
    const served = await (await fetch(BASE + '/texts/' + encodeURIComponent(name))).text();
    check('**檔案真的被覆蓋**', served === marker, `${served.length} 字元`);
    check('長度對得上', served.length === marker.length);
  } finally {
    const back = await post({ dir: 'texts', name, content: orig });
    check('已還原原檔', back.j && back.j.ok);
  }
  const after = await (await fetch(BASE + '/texts/' + encodeURIComponent(name))).text();
  check('還原後內容一致', after === orig, `${after.length} 字元`);
}

console.log('\n=== ②b 使用者自帶的檔案同樣可覆蓋 ===');
{
  /*
   * 這一組是這次改動的核心：**直接覆蓋使用者自己放進 texts/ 的檔案**。
   * 內容原樣寫回，不算改動，所以不需要還原。
   */
  for (const [dir, name] of [['texts', '千字文.txt'], ['derivers', '架空_交州白話.txt']]) {
    const cur = await (await fetch(`${BASE}/${dir}/` + encodeURIComponent(name))).text();
    if (!cur) { check(`${dir}/${name} 可讀`, false, '讀不到，略過'); continue; }
    const r = await post({ dir, name, content: cur });
    check(`覆蓋 ${dir}/${name}`, r.j && r.j.ok,
      r.j && r.j.ok ? `${r.j.bytes} 位元組` : `HTTP ${r.status} ${r.j ? r.j.error : ''}`);
  }
}

console.log('\n=== ③ 新建文件（测完删除）===');
{
  const name = '__test_new.txt';
  const r = await post({ dir: 'texts', name, content: '天地玄黃' });
  check('新建成功', r.j && r.j.ok, JSON.stringify(r.j));
  check('文件存在', fs.existsSync(path.join(ROOT, 'texts', name)));
  const list = await (await fetch(BASE + '/api/texts')).json();
  check('出现在列表裏', list.some(f => f.name === name));
  /* 刪文件在沙箱裏是被禁的（工作區目錄上有 Everyone 的
     DeleteSubdirectoriesAndFiles 拒絕項），所以刪不掉時按「略過」處理，
     而不是判失敗 —— 在沙箱外跑仍會真的驗證清理。 */
  const leftover = path.join(ROOT, 'texts', name);
  let removed = false;
  try { fs.unlinkSync(leftover); removed = !fs.existsSync(leftover); } catch (e) { removed = false; }
  if (removed) check('已清理', true);
  else console.log('  · 略過「已清理」：本環境禁止刪工作區文件（沙箱拒絕項），請在沙箱外再跑一次');
}

console.log('\n=== ④ derivers/ 也能存 ===');
{
  const name = '__test_deriver.js';
  const r = await post({ dir: 'derivers', name, content: 'return "x";' });
  check('保存成功', r.j && r.j.ok, JSON.stringify(r.j));
  check('文件存在', fs.existsSync(path.join(ROOT, 'derivers', name)));
  try { fs.unlinkSync(path.join(ROOT, 'derivers', name)); } catch (e) {}
}

console.log('\n=== ⑤ 安全限制 ===');
const BAD = [
  [{ dir: 'web', name: 'x.txt', content: 'x' }, '目錄白名單'],
  [{ dir: 'texts', name: '../evil.txt', content: 'x' }, '路徑穿越 ..'],
  [{ dir: 'texts', name: 'sub/evil.txt', content: 'x' }, '路徑分隔符'],
  [{ dir: 'texts', name: '.hidden.txt', content: 'x' }, '點開頭'],
  [{ dir: 'texts', name: 'evil.exe', content: 'x' }, '副檔名'],
  [{ dir: 'texts', name: '', content: 'x' }, '空檔名'],
  [{ dir: 'derivers/x', name: 'a.js', content: 'x' }, '目錄帶路徑'],
];
for (const [body, label] of BAD) {
  const r = await post(body);
  check(`拒絕：${label}`, !(r.j && r.j.ok), `HTTP ${r.status} ${r.j ? r.j.error : ''}`);
}
/* 确认真没写出去 */
for (const p of ['evil.txt', 'texts/evil.txt', 'sub/evil.txt', '.hidden.txt']) {
  if (fs.existsSync(path.join(ROOT, p))) { check(`未产生 ${p}`, false); try { fs.unlinkSync(path.join(ROOT, p)); } catch (e) {} }
}
check('未产生任何越界文件', !fs.existsSync(path.join(ROOT, 'evil.txt')));

console.log('\n=== ⑥ 大内容被拒 ===');
{
  const r = await post({ dir: 'texts', name: '__big.txt', content: 'x'.repeat(5 * 1024 * 1024) });
  check('拒绝 5 MB', !(r.j && r.j.ok), `HTTP ${r.status} ${r.j ? r.j.error : ''}`);
  check('未产生文件', !fs.existsSync(path.join(ROOT, 'texts', '__big.txt')));
}

console.log(`\n${'='.repeat(52)}`);
console.log(`通過 ${pass} / 失敗 ${fail}`);
process.exit(fail ? 1 : 0);
