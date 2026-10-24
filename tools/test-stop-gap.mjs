/*
 * test-stop-gap.mjs — 音長補償在「短音節 + 停頓」邊界上是否生效
 *
 * 背景：引擎把帶塞音尾的音節壓到只有 61–62%（例：ik 74ms、ɑk 95ms），
 *       所以 web/derive.html 有「補償」滑條：gap = 補償 × (目標週期 − 實際時長)。
 *
 * 要抓的 bug：原本只在「字接字」時插補償間隔；字後面若跟停頓段
 * （空格 / 標點 / 換行），補償整個失效 —— 短音節貼着停頓，聽感像被吞掉。
 *
 * 做法：桩引擎讓每個音節都只有 74ms（模擬入聲），
 *       比對「字接字」「字接空格」「字接句號」三種邊界的總時長。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'web', 'derive.html'), 'utf8');

const SR = 22050;
let SYL_MS = 74;                 // 桩引擎給每個音節的長度
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail?.message || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc, url: 'http://127.0.0.1:8981/' });
const { window } = dom;
const doc = window.document;

let played = null;
window.AudioContext = class {
  constructor() { this.state = 'running'; }
  resume() {}
  createBuffer() { return { copyToChannel(a) { played = a; } }; }
  createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
};
window.Worker = class { constructor() {} postMessage() {} terminate() {} addEventListener() {} };
const ROUTES = {
  '/derivers/__sample.js': 'tools/fixtures.mjs',
  '/reference/site-fallback-table.json': 'reference/site-fallback-table.json',
  '/reference/site-variant-table.json': 'reference/site-variant-table.json',
};
window.fetch = async (u) => {
  const url = String(u).split('?')[0];
  const p = path.join(ROOT, ROUTES[url] ?? url.replace(/^\//, ''));
  if (url.startsWith('/api/')) {
    if (url === '/api/derivers') {
      const l = [{ name: '__sample.js', url: '/derivers/__sample.js', size: 0 }];
      return { ok: true, status: 200, text: async () => JSON.stringify(l), json: async () => l };
    }
    const exts = url === '/api/texts' ? ['.txt', '.md'] : ['.js', '.txt', '.mjs'];
    let list = [];
    try {
      const d = path.join(ROOT, url === '/api/texts' ? 'texts' : 'derivers');
      list = fs.readdirSync(d).filter(f => exts.includes(path.extname(f).toLowerCase()))
        .sort().map(f => ({ name: f, url: '/' + (url === '/api/texts' ? 'texts' : 'derivers') + '/' + encodeURIComponent(f), size: 0 }));
    } catch (e) {}
    return { ok: true, status: 200, text: async () => JSON.stringify(list), json: async () => list };
  }
  const ok = fs.existsSync(p);
  const txt = ok ? fs.readFileSync(p, 'utf8') : '';
  return { ok, status: ok ? 200 : 404, text: async () => txt, json: async () => JSON.parse(txt || '{}') };
};
window.eSpeakNG = class {
  constructor(u, cb) { setTimeout(() => cb && cb(), 0); }
  set_rate() {} set_pitch() {} set_voice() {} delete() {}
  synthesize(t, cb) {
    /* 桩：固定时长的正弦，长度由 SYL_MS 控制（模拟引擎把短音節壓短） */
    const n = Math.round(SR * SYL_MS / 1000);
    const buf = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const v = Math.sin(i / 8) * 0.4;
      buf[i * 2] = v; buf[i * 2 + 1] = v;
    }
    setTimeout(() => { cb(buf); cb(null); }, 0);
  }
};
window.URL.createObjectURL = () => 'blob:x';
window.navigator.clipboard = { writeText: async () => {} };

for (const f of ['node_modules/tshet-uinh/index.js', 'node_modules/tshet-uinh-deriver-tools/dist/index.js']) {
  try { window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { errors.push('装 ' + f + ': ' + e.message); }
}

const mod = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
let src = mod;
for (const [full, namesRaw, href] of [...mod.matchAll(/import\s+\{([^}]+)\}\s+from\s+'([^']+)'/g)]) {
  const abs = path.join(ROOT, href.replace(/^\//, ''));
  const specs = namesRaw.split(',').map(s => s.trim()).filter(Boolean);
  const exps = [], dest = [];
  for (const sp of specs) {
    const m = sp.match(/^(\S+)\s+as\s+(\S+)$/);
    if (m) { exps.push(m[1]); dest.push(`${m[1]}: ${m[2]}`); } else { exps.push(sp); dest.push(sp); }
  }
  const key = '__m_' + href.replace(/\W/g, '_');
  const body = fs.readFileSync(abs, 'utf8').replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm, '');
  window.eval(`window.${key} = (function(){ ${body}\n; return {${exps.join(',')}}; })()`);
  src = src.replace(full, `const {${dest.join(',')}} = window.${key};`);
}
try { window.eval(src); } catch (e) { errors.push('module: ' + e.message); }
doc.dispatchEvent(new window.Event('DOMContentLoaded'));
window.dispatchEvent(new window.Event('load'));

const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));
await tick(600);

const $ = id => doc.getElementById(id);
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}${x ? '  ' + x : ''}`); } else { fail++; console.log(`  ✗ ${n}${x ? '  ' + x : ''}`); } };

/** 朗讀指定文字，回傳合計毫秒（從 log 的「合計 N 字成功，X.XX 秒」讀） */
async function readMs(text) {
  $('log').textContent = '';
  $('text').value = text;
  $('deriveOnly').click();
  await tick(300);
  $('play').click();
  for (let i = 0; i < 60; i++) {
    const m = $('log').textContent.match(/合計\s*(\d+)\s*字成功[^，]*，\s*([\d.]+)\s*秒/);
    if (m) return Math.round(Number(m[2]) * 1000);
    await tick(100);
  }
  return NaN;
}

console.log('=== 短音節（74ms，模擬入聲）的音長補償 ===');
console.log(`目标周期 ${$('targetR').value}ms、补偿 ${$('compR').value}%、音节 ${SYL_MS}ms`);
check('无 JS 错误', errors.length === 0, errors.join(' | '));

const comp = Number($('compR').value) / 100;
const target = Number($('targetR').value);
const gapCharChar = Math.max(0, Math.min(400, comp * (target - SYL_MS)));
const gapTiny = Math.max(0, Math.min(400, comp * (target - SYL_MS - 40)));

const A = await readMs('天地');
const B = await readMs('天 地');
const C = await readMs('天。地');

console.log(`  字接字   ${A}ms（期望 ≈ ${SYL_MS * 2 + gapCharChar}）`);
console.log(`  字接空格 ${B}ms（期望 ≈ ${SYL_MS * 2 + 40 + gapTiny}；補償失效時只有 ${SYL_MS * 2 + 40}）`);
console.log(`  字接句號 ${C}ms（期望 ≈ ${SYL_MS * 2 + 320}，停頓不該被拉長）`);

check('字接字：有補償', Math.abs(A - (SYL_MS * 2 + gapCharChar)) <= 20, `${A}ms`);
check('字接空格：補償仍然生效（本次 bug）',
  Math.abs(B - (SYL_MS * 2 + 40 + gapTiny)) <= 25,
  `${B}ms，期望 ≈ ${SYL_MS * 2 + 40 + gapTiny}`);
check('字接句號：長停頓不被拉長',
  Math.abs(C - (SYL_MS * 2 + 320)) <= 25, `${C}ms`);

/* 關掉補償：字接空格應回到「純停頓」 */
$('compR').value = '0';
$('compR').dispatchEvent(new window.Event('input'));
const B0 = await readMs('天 地');
$('compR').value = '70';
$('compR').dispatchEvent(new window.Event('input'));
check('補償=0 時字接空格只有停頓', Math.abs(B0 - (SYL_MS * 2 + 40)) <= 20, `${B0}ms`);

console.log(`\n${'='.repeat(52)}`);
console.log(`通過 ${pass} / 失敗 ${fail}`);
if (errors.length) { console.log('JS 错误：'); errors.forEach(e => console.log('  ' + e)); }
process.exit(fail || errors.length ? 1 : 0);
