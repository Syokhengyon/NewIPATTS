/*
 * extract-fallback-table.mjs — 提取 WASM 里第二张字表（廣韻之外的补充字表）
 *
 * 格式（空格分隔，一行一条）：
 *   字 母 韻 聲 等 類 呼 反切上 反切下 韻目 攝 上古音 釋義
 *
 * 这张表的作用：收了很多《廣韻》字表里没有的字 —— 例如「窗」。
 * 站点对不在廣韻里的字能「类推」，靠的就是它。
 *
 * 两个坑：
 *   1. 用 \s 做分隔会跨行匹配 —— 必须按行切分再解析
 *   2. 表里混了少量**简化字韻目**（删、东…），而 from描述 只认繁体
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* 路徑：站點原始文件統一放在 site-source/ 下 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site-source');
const WASM = path.join(SITE, 'duyin-web_bg.wasm');

const buf = fs.readFileSync(WASM);
const utf8 = buf.toString('utf8');

/* 简化字 → 繁体（韻目名常见者） */
const S2T = {
  '东': '東', '钟': '鍾', '鱼': '魚', '齐': '齊', '谆': '諄', '删': '刪', '萧': '蕭',
  '阳': '陽', '盐': '鹽', '衔': '銜', '严': '嚴', '谈': '談', '废': '廢', '问': '問',
  '换': '換', '谏': '諫', '线': '線', '啸': '嘯', '号': '號', '过': '過', '祃': '禡',
  '诤': '諍', '劲': '勁', '径': '徑', '艳': '艷', '鉴': '鑑', '酽': '釅', '烛': '燭',
  '觉': '覺', '质': '質', '术': '術', '栉': '櫛', '没': '沒', '药': '藥', '铎': '鐸',
  '麦': '麥', '锡': '錫', '职': '職', '缉': '緝', '叶': '葉', '业': '業', '骇': '駭',
  '队': '隊', '个': '个',
};

/*
 * 韻目歸併：tshet-uinh 只認**平聲韻目**（共 58 個），
 * 上/去/入聲韻目都要歸到對應的平聲名。
 * 例：曷→寒、洽→咸、屋→東、薛→仙、洽→咸。
 * 祭 泰 夬 廢 四個是「去聲獨立」的韻，本身就是合法韻目，不歸併。
 */
const 韻歸併 = (() => {
  const groups = [
    ['東', '董 送 屋'], ['冬', '宋 沃'], ['鍾', '腫 用 燭'], ['江', '講 絳 覺'],
    ['支', '紙 寘'], ['脂', '旨 至'], ['之', '止 志'], ['微', '尾 未'],
    ['魚', '語 御'], ['虞', '麌 遇'], ['模', '姥 暮'], ['齊', '薺 霽'],
    ['佳', '蟹 卦'], ['皆', '駭 怪'], ['灰', '賄 隊'], ['咍', '海 代'],
    ['真', '軫 震 質'], ['諄', '準 稕 術'], ['臻', '櫛'], ['文', '吻 問 物'],
    ['殷', '隱 焮 迄'], ['欣', '隱 焮 迄'], ['元', '阮 願 月'], ['魂', '混 慁 沒'],
    ['痕', '很 恨'], ['寒', '旱 翰 曷'], ['桓', '緩 換 末'], ['刪', '潸 諫 黠'],
    ['山', '產 襉 鎋'], ['先', '銑 霰 屑'], ['仙', '獮 線 薛'],
    ['蕭', '篠 嘯'], ['宵', '小 笑'], ['肴', '巧 效'], ['豪', '皓 號'],
    ['歌', '哿 箇'], ['戈', '果 過'], ['麻', '馬 禡'],
    ['陽', '養 漾 藥'], ['唐', '蕩 宕 鐸'],
    ['庚', '梗 映 陌'], ['耕', '耿 諍 麥'], ['清', '靜 勁 昔'], ['青', '迥 徑 錫'],
    ['尤', '有 宥'], ['侯', '厚 候'], ['幽', '黝 幼'],
    ['侵', '寢 沁 緝'], ['覃', '感 勘 合'], ['談', '敢 闞 盍'],
    ['鹽', '琰 豔 葉'], ['添', '忝 掭 帖'],
    ['咸', '豏 陷 洽'], ['銜', '檻 鑑 狎'], ['嚴', '儼 釅 業'], ['凡', '范 梵 乏'],
    ['登', '等 嶝 德'], ['蒸', '拯 證 職'],
  ];
  const m = new Map();
  for (const [平, rest] of groups) for (const r of rest.split(' ')) m.set(r, 平);
  return m;
})();
const 母SET = new Set('幫滂並明端透定泥知徹澄娘見溪羣群疑精心清從邪照莊初牀崇生俟曉匣影云以于來日審書禪船敷非奉微孃'.split(''));
const 聲SET = new Set('平上去入'.split(''));

new Function(fs.readFileSync(path.join(ROOT, 'node_modules', 'tshet-uinh', 'index.js'), 'utf8'))();
const T = globalThis.TshetUinh;

const lines = utf8.split('\r\n');
console.log(`WASM 文本共 ${lines.length} 行`);

const rows = [];
let scanned = 0;
for (const line of lines) {
  const p = line.split(' ');
  if (p.length < 6) continue;
  const [字, 母, 韻, 聲, 等AS, 類AS] = p;
  if (!字 || [...字].length !== 1) continue;
  if (!母SET.has(母)) continue;
  if (!聲SET.has(聲)) continue;
  if (!/^[1-4]$/.test(等AS)) continue;
  if (類AS !== '' && !/^[ABC]$/.test(類AS)) continue;
  scanned++;
  const 韻T = S2T[韻] || 韻;
  const 等 = '一二三四'[Number(等AS) - 1];
  rows.push({ 字, 母, 韻: 韻T, 原韻: 韻, 聲, 等, 類: 類AS || '', 呼: '' });
}
console.log(`按行解析命中 ${scanned} 行`);

/* 呼：紧跟類之後那一格。**空着就保持空** —— 江韻等「開合中立韻」不能帶呼，
   一律默認成「開」會讓這些行全部非法。 */
const rows2 = [];
for (const line of utf8.split('\r\n')) {
  const p = line.split(' ');
  if (p.length < 7) continue;
  const [字, 母, 韻, 聲, 等AS, 類AS, 呼AS] = p;
  if (!字 || [...字].length !== 1 || !母SET.has(母) || !聲SET.has(聲)) continue;
  if (!/^[1-4]$/.test(等AS)) continue;
  if (類AS !== '' && !/^[ABC]$/.test(類AS)) continue;
  if (呼AS !== '開' && 呼AS !== '合' && 呼AS !== '') continue;
  const rest = p.slice(7);
  const 韻T = 韻歸併.get(S2T[韻] || 韻) || S2T[韻] || 韻;   // 上/去/入 → 平聲名
  /*
   * 釋義的起點靠「上古音那一格」定位。
   * **不能按固定下標取** —— 原表裏字段間有單空格也有雙空格，
   * 固定下標會漂，把上古音（shroːŋ）也喫進釋義裏。
   * 上古音那一格的特點是**全由拉丁字母與音標符號組成**。
   */
  /*
   * 上古音那一格的特點是**全由拉丁字母與音標符號組成**。
   * 注意要覆蓋 Latin Extended-B（ŋ U+014B、ƛ U+019B）與 IPA 擴展
   * （ɡ U+0261、ʔ U+0294、ː U+02D0）—— 只寫 A-Za-z 會漏掉 ŋ，
   * 結果「窗」那一行的上古音 shroːŋ 認不出來，被喫進釋義。
   */
  const isOldChinese = (s) => !!s &&
    /^[A-Za-z\u00C0-\u024F\u0250-\u02FF\u1D00-\u1D7F\u207F\u2070-\u209F]+$/.test(s);
  let k = -1;
  for (let x = 2; x < rest.length; x++) if (isOldChinese(rest[x])) { k = x; break; }
  /*
   * 釋義**必須含漢字**。有些行有兩個音標格（例如
   * `令 來 青 平 4  開 郎 丁 令 耕  reːŋ riːŋ` —— 上古音與中古轉寫），
   * 而那行根本沒有釋義；不加這條會把第二個音標當成釋義。
   */
  const 釋義 = (k >= 0 ? rest.slice(k + 1) : rest.slice(4))
    .filter(x => /[\u4e00-\u9fff]/.test(x)).join(' ').replace(/\s+/g, ' ').trim();
  rows2.push({
    字, 母, 韻: 韻T, 原韻: 韻, 聲,
    等: '一二三四'[Number(等AS) - 1], 類: 類AS || '', 呼: 呼AS,
    反切: (rest[0] || '') + (rest[1] || ''),
    釋義,
  });
}
console.log(`带呼的 ${rows2.length} 行`);

/* 去重 + 校验。
   原表与 tshet-uinh 有两处对不上，都要修補：
     · 江韻等「開合中立韻」原表带了呼，tshet-uinh 不許 —— 去掉呼再试
     · 三等有些行省了「類」—— 補 C/B/A 再试
   两处可组合，所以穷举「呼 有/无」×「類 原樣/C/B/A」。 */
const byZi = new Map();
let ok = 0;
const bad = [];
for (const r of rows2) {
  const 類cands = r.類 ? [r.類] : ['', 'C', 'B', 'A'];
  const 呼cands = r.呼 ? [r.呼, ''] : [''];
  const cands = [];
  for (const 呼 of 呼cands) for (const 類 of 類cands) {
    cands.push([r.母, 呼, r.等, 類, r.韻, r.聲].filter(v => v !== '').join(''));
  }
  let hit = null;
  for (const c of cands) { try { T.音韻地位.from描述(c); hit = c; break; } catch (e) {} }
  if (!hit) { if (bad.length < 10) bad.push(`${r.字} ${cands[0]}`); continue; }
  ok++;
  if (!byZi.has(r.字)) byZi.set(r.字, []);
  if (!byZi.get(r.字).some(x => x.描述 === hit)) {
    byZi.get(r.字).push({ 描述: hit, 反切: r.反切, 釋義: r.釋義 });
  }
}
console.log(`\n合法 ${ok} 条，丢弃 ${bad.length ? '（样本）' : ''}`);
bad.forEach(b => console.log('  ' + b));
console.log(`有效字 ${byZi.size} 个`);

/* 直接检查关键字的收录情况 */
console.log('\n=== 收录检查 ===');
for (const ch of ['窗', '牎', '窓', '囱']) {
  const inRows = rows2.filter(r => r.字 === ch);
  console.log(`  ${ch}: rows2 中 ${inRows.length} 条，byZi 中 ${byZi.has(ch) ? byZi.get(ch).length + ' 条' : '无'}`);
  inRows.slice(0, 2).forEach(r => {
    const base = [r.母, r.呼, r.等, r.類, r.韻, r.聲].filter(v => v !== '').join('');
    let v = '✗';
    try { v = '✓ ' + T.音韻地位.from描述(base).描述; } catch (e) { v = '✗ ' + e.message; }
    console.log(`      base=${JSON.stringify(base)}  原韻=${r.原韻}  ${v}`);
  });
}

const index = {};
for (const [字, list] of byZi) index[字] = list;

console.log('\n=== 关键验证 ===');
for (const ch of ['窗', '牎', '窓', '囱', '囪', '匆', '忩', '你', '們', '国', '汉', '语', '简', '体', '这', '为', '发', '头', '们', '无', '与', '万']) {
  const g = (T.資料.query字頭(ch) || []).map(r => {
    const o = r.音韻地位;
    return [o.母, o.呼, o.等, o.類, o.韻, o.聲].filter(v => v != null && v !== '').join('');
  });
  const f = index[ch];
  console.log(`  ${ch}  廣韻: ${(g.join('/') || '—').padEnd(14)} 補充表: ${f ? f.map(x => x.描述).join('/') : '—'}`);
}

let onlyHere = 0, both = 0;
for (const 字 of Object.keys(index)) ((T.資料.query字頭(字) || []).length ? both++ : onlyHere++);
console.log(`\n廣韻也有的 ${both} 个；**只在这张表里**的 ${onlyHere} 个`);

const out = path.join(ROOT, 'reference', 'site-fallback-table.json');
fs.writeFileSync(out, JSON.stringify(index), 'utf8');
console.log(`\n已写出 reference/site-fallback-table.json（${(fs.statSync(out).size / 1048576).toFixed(2)} MB）`);
