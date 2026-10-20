/*
 * modes/qieyun.mjs — 模式一：推導模式（以切韻推導器為藍本）
 *
 * 資料流：
 *     漢字 ──query字頭──▶ 音韻地位 ──推導器──▶ IPA 串 ──Speaker──▶ 音頻
 *
 * 「音韻地位」提供器有兩種來源：
 *   A. 內建：用 npm 套件 `tshet-uinh`（推薦，需先 npm install）
 *      呼叫 useTshetUinh() 啟用
 *   B. 外部：你自己傳一個 { query字頭(字) -> [原始音韻地位...], from描述(str) -> 實例 }
 *      呼叫 useProvider(obj)
 *
 * 推導器本身有兩種提供方式：
 *   1. registerFromFile / registerFromSource —— 站點上那種「函數體」源碼
 *   2. register —— 直接傳函數 (音韻地位) => IPA
 */
import fs from 'node:fs';
import path from 'node:path';

/* ============================ 音韻地位提供器 ============================ */

let provider = null;

/**
 * 內建提供器：tshet-uinh
 * 描述串格式為「母 + 呼 + 等 + [類] + 韻 + 聲」，
 * 例如 生開二山平、匣合一唐平、並三C庚入（庚韻開合中立時省略呼）。
 */
export async function useTshetUinh() {
  const mod = await import('tshet-uinh');
  const T = mod.default || mod;

  provider = {
    name: 'tshet-uinh',
    原始查字(ch) {
      return T.資料.query字頭(ch) || [];
    },
    from描述(d) {
      return T.音韻地位.from描述(d);
    },
    描述串(raw) {
      const o = raw.音韻地位 || raw;
      return [o.母, o.呼, o.等, o.類, o.韻, o.聲]
        .filter(v => v !== null && v !== undefined && v !== '')
        .join('');
    },
    T,
  };
  return provider;
}

/** 外部提供器：需實作 原始查字 / from描述 / 描述串 */
export function useProvider(p) {
  if (!p || typeof p.原始查字 !== 'function' || typeof p.from描述 !== 'function') {
    throw new Error('提供器需實作 原始查字(字) 與 from描述(描述串)');
  }
  if (typeof p.描述串 !== 'function') {
    p.描述串 = (raw) => {
      const o = raw.音韻地位 || raw;
      return [o.母, o.呼, o.等, o.類, o.韻, o.聲].filter(Boolean).join('');
    };
  }
  provider = p;
  return p;
}

export function hasProvider() { return !!provider; }

/**
 * 查一個字對應的所有音韻地位（一字可能多音）。
 * @returns {Array<{描述:string, 地位:object|null, 反切?:string, 來源?:object, err?:string}>}
 */
export function 查字(ch) {
  if (!provider) throw new Error('尚未設定音韻地位提供器，請先 useTshetUinh() 或 useProvider()');
  const rows = provider.原始查字(ch) || [];
  const out = [];
  for (const row of rows) {
    const d = provider.描述串(row);
    try {
      out.push({ 描述: d, 地位: provider.from描述(d), 反切: row.反切, 來源: row.來源 });
    } catch (e) {
      out.push({ 描述: d, 地位: null, err: e.message, 反切: row.反切, 來源: row.來源 });
    }
  }
  return out;
}

/* ============================ 推導器註冊表 ============================ */

const REGISTRY = new Map();

/**
 * 從源碼文本建立推導器。
 * 站點上的推導器是「函數體」形式：
 *   if (!音韻地位) return [["轉寫", false]];
 *   const is = (x) => 音韻地位.屬於(x);
 *   ...
 *   return 聲母 + 韻母 + 聲調;
 * 用 new Function('音韻地位', source) 包裝即可。
 */
/**
 * 從源碼文本建立推導器。
 *
 * 推導器是「函數體」形式，自由變數有**四個**（依 tshet-uinh-deriver-tools 的定義）：
 *
 *     new Function("TshetUinh", "選項 = {}", "音韻地位", "字頭 = null", 方案代碼)
 *
 *   TshetUinh   整個資料庫
 *   選項        方案的設定項，預設 {}；方案用「音韻地位 為 null 時返回設定項列表」宣告
 *   音韻地位    音韻地位實例（可用 屬於 / 調整 等）
 *   字頭        當前漢字，預設 null
 *
 * 缺少其中任何一個，用到它的方案就會整個拋錯 ——
 * 例如只傳 音韻地位 時，用 `字頭` 做例外處理的方案會拋「字頭 is not defined」。
 *
 * @param {string} source 方案代碼（函數體）
 * @param {object} [TshetUinh] 資料庫對象；不給則從 provider 取
 */
export function compileDeriver(source, TshetUinh) {
  const T = TshetUinh || (provider && provider.T);
  if (!T) throw new Error('compileDeriver 需要 TshetUinh（請先 useTshetUinh()，或作為第二個參數傳入）');
  /* 與站點完全一致的包裝方式 */
  const fn = new Function('TshetUinh', '選項', '音韻地位', '字頭', source)
    .bind(undefined, T);
  return (position, 字頭 = null, 選項 = {}) => {
    const r = fn(選項, position, 字頭);
    if (Array.isArray(r)) return '';        // 約定：返回數組表示「僅轉寫，不發音」
    return String(r == null ? '' : r);
  };
}

/** 讀取方案宣告的設定項（傳 音韻地位 = null 時的返回） */
export function deriverOptions(source, TshetUinh, 選項 = {}) {
  const T = TshetUinh || (provider && provider.T);
  if (!T) throw new Error('需要 TshetUinh');
  const fn = new Function('TshetUinh', '選項', '音韻地位', '字頭', source).bind(undefined, T);
  const r = fn(選項, null, null);
  if (!Array.isArray(r)) return [];
  return r.filter(x => Array.isArray(x) && x.length >= 2).map(([key, value]) => ({ key, value }));
}

export function register({ id, name, deriver, options }) {
  if (!id) throw new Error('register 需要 id');
  REGISTRY.set(id, { id, name: name || id, deriver, options: options || {} });
  return id;
}

export function registerFromSource({ id, name, source, options, TshetUinh }) {
  return register({
    id, name,
    deriver: compileDeriver(source, TshetUinh),
    options: options || (TshetUinh || provider?.T ? deriverOptions(source, TshetUinh) : []),
  });
}

export function registerFromFile({ id, name, file, options }) {
  const source = fs.readFileSync(file, 'utf8');
  return registerFromSource({ id, name: name || path.basename(file, path.extname(file)), source, options });
}

export function list() {
  return Array.from(REGISTRY.values()).map(v => ({ id: v.id, name: v.name }));
}
export function has(id) { return REGISTRY.has(id); }
export function get(id) {
  const e = REGISTRY.get(id);
  if (!e) throw new Error('未註冊的音系: ' + id + '（已有: ' + Array.from(REGISTRY.keys()).join(', ') + '）');
  return e;
}
export function derive(id, position, 字頭 = null, 選項) { return get(id).deriver(position, 字頭, 選項); }

/* ============================ 端到端 ============================ */

/**
 * 一段文本 → IPA → 音頻。
 * @param {import('../speak.mjs').Speaker} speaker
 * @param {string} deriverId  已註冊的音系 id
 * @param {string} text       漢字文本
 * @param {object} [opts]
 * @param {number} [opts.maxReadings=1] 每字取幾個讀音（多音字）
 * @returns {Promise<{wav:Buffer, ipaText:string, rows:Array}>}
 */
export async function speakText(speaker, deriverId, text, opts = {}) {
  if (!provider) throw new Error('尚未設定音韻地位提供器');
  const maxReadings = opts.maxReadings ?? 1;
  const rows = [];
  const ipaList = [];

  for (const ch of String(text)) {
    if (/\s/.test(ch)) continue;
    let list;
    try { list = 查字(ch); } catch (e) { rows.push({ 字: ch, err: e.message }); continue; }
    const usable = list.filter(x => x.地位);
    if (!usable.length) {
      rows.push({ 字: ch, err: list.length ? (list[0].err || '無法建構音韻地位') : '廣韻查不到此字' });
      continue;
    }
    const picks = [];
    for (const x of usable.slice(0, maxReadings)) {
      let ipa = '';
      /* 必須把字頭傳進去 —— 不少推導器按字頭做例外處理 */
      try { ipa = derive(deriverId, x.地位, ch); } catch (e) { ipa = ''; }
      if (ipa) { picks.push(ipa); ipaList.push(ipa); }
    }
    rows.push({ 字: ch, 描述: usable.map(x => x.描述), ipa: picks, 反切: usable[0].反切 });
  }

  const ipaText = ipaList.join(' ');
  const wav = ipaText ? await speaker.toWav(ipaText, opts) : Buffer.alloc(0);
  return { wav, ipaText, rows };
}

/** 只推導、不出音頻（用於檢查） */
export function deriveText(deriverId, text, opts = {}) {
  if (!provider) throw new Error('尚未設定音韻地位提供器');
  const rows = [];
  const ipaList = [];
  for (const ch of String(text)) {
    if (/\s/.test(ch)) continue;
    const list = 查字(ch);
    const usable = list.filter(x => x.地位);
    if (!usable.length) { rows.push({ 字: ch, ipa: '', err: '查不到' }); continue; }
    const ipa = derive(deriverId, usable[0].地位, ch);
    if (ipa) ipaList.push(ipa);
    rows.push({ 字: ch, 描述: usable[0].描述, 反切: usable[0].反切, ipa });
  }
  return { ipaText: ipaList.join(' '), rows };
}
