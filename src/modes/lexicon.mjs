/*
 * modes/lexicon.mjs — 模式二：字表模式（預留）
 *
 * 用途：直接給「字 → IPA」的對照表，不跑推導規則。
 *       適合你自己擬定的一套擬音（上古、中古、或其他構擬），
 *       只要每個字對應一串 IPA，就能發音。
 *
 * 字表格式（兩種都支持）：
 *   A. 對象：  { "山": "ʂæn⁵³", "水": "ɕyi²⁴" }
 *   B. 數組：  [{ "字": "山", "ipa": "ʂæn⁵³" }, ...]
 *   C. 文本：  每行「字<TAB或空格>IPA」，# 開頭為註釋
 *
 * 多音字：值可以是數組 ["a²⁴","a⁵³"]，或對象 { "默認": "...", "又音": "..." }
 */
import fs from 'node:fs';

export class LexiconMode {
  constructor() {
    /** @type {Map<string,string[]>} 字 -> IPA 列表 */
    this.map = new Map();
    this.source = null;
  }

  /** 從對象/數組載入 */
  load(data) {
    this.map.clear();
    if (Array.isArray(data)) {
      for (const row of data) {
        const ch = row['字'] ?? row.char ?? row.glyph;
        const ipa = row['ipa'] ?? row['擬音'] ?? row.pron;
        if (ch) this._put(ch, ipa);
      }
    } else if (data && typeof data === 'object') {
      for (const [ch, ipa] of Object.entries(data)) this._put(ch, ipa);
    } else {
      throw new Error('字表格式無法識別（需對象或數組）');
    }
    return this.map.size;
  }

  _put(ch, ipa) {
    const list = [];
    const push = (v) => { if (v == null) return; if (Array.isArray(v)) v.forEach(push); else list.push(String(v)); };
    push(ipa);
    if (list.length) this.map.set(String(ch), list);
  }

  /** 從文本載入：每行「字 IPA」，# 註釋 */
  loadText(text) {
    const rows = [];
    for (const line of String(text).split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith('#') || s.startsWith('//')) continue;
      const m = s.match(/^(\S)\s+(.+)$/);
      if (m) rows.push({ 字: m[1], ipa: m[2].trim() });
    }
    return this.load(rows);
  }

  /** 從文件載入（.json 或 .txt） */
  loadFile(file) {
    const text = fs.readFileSync(file, 'utf8');
    this.source = file;
    if (/\.json$/i.test(file) || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      return this.load(JSON.parse(text));
    }
    return this.loadText(text);
  }

  size() { return this.map.size; }

  /** 查一個字，返回 IPA（多音字返回第一個；用 all() 取全部） */
  lookup(ch) {
    const v = this.map.get(String(ch));
    return v && v.length ? v[0] : null;
  }
  all(ch) {
    return this.map.get(String(ch)) || [];
  }

  /**
   * 把一段文本逐字轉成 IPA 串。
   * 未收錄的字會被記錄並跳過（可在報告裡看到）。
   */
  toIpa(text) {
    const out = [];
    const missing = [];
    for (const ch of String(text)) {
      if (/\s/.test(ch)) continue;
      const ipa = this.lookup(ch);
      if (ipa) out.push(ipa);
      else missing.push(ch);
    }
    return { ipa: out.join(' '), missing, count: out.length };
  }

  /** 用 Speaker 發音 */
  async speak(speaker, text, opts = {}) {
    const { ipa, missing, count } = this.toIpa(text);
    if (!ipa) return { wav: Buffer.alloc(0), ipa: '', missing, count: 0 };
    const wav = await speaker.toWav(ipa, opts);
    return { wav, ipa, missing, count };
  }
}

/** 便捷：從文件建立實例 */
export function fromFile(file) {
  const m = new LexiconMode();
  m.loadFile(file);
  return m;
}
