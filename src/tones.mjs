/*
 * tones.mjs — 声调处理
 *
 * 已实测的机制（见 README 的「声调」一节）：
 *   espeak 把每个声调数字当作一个「平调目标」，多个数字 = 一串目标顺序排列。
 *   5→1 的总跨度约 9 半音，但单个轮廓只能走到其中一部分。
 *   音节时长固定（约 0.27s），所以三位调会被压扁。
 *
 * 本模块负责：
 *   1. 把各种写法的调值（上标 ⁵³ / ASCII 53 / 五度符号）归一化成 ASCII 数字串
 *   2. 给出「该调值需要多长的音节」的建议（三位调自动降速）
 *   3. 为将来的后处理（自己重画 F0）提供五度值 → 半音的映射
 */

/** 上标数字 → ASCII */
const SUP = {
  '\u2070': '0', '\u00b9': '1', '\u00b2': '2', '\u00b3': '3', '\u2074': '4',
  '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9',
};

/** 全角数字 → ASCII */
const FULLWIDTH = { '０':'0','１':'1','２':'2','３':'3','４':'4','５':'5','６':'6','７':'7','８':'8','９':'9' };

/**
 * 归一化调值写法。
 *   '⁵³'  -> '53'
 *   '53'  -> '53'
 *   '²¹²' -> '212'
 * 同时把 '⁴²³' 这种整串都归一化。
 */
export function normalizeTones(s) {
  let out = '';
  for (const ch of String(s)) {
    if (SUP[ch] !== undefined) out += SUP[ch];
    else if (FULLWIDTH[ch] !== undefined) out += FULLWIDTH[ch];
    else out += ch;
  }
  return out;
}

/** 从音节串尾部取出调值（连续的数字，或带 ˥˦˧˨˩ 的五度字母） */
const LETTER_TONE = { '\u02e5': '5', '\u02e6': '4', '\u02e7': '3', '\u02e8': '2', '\u02e9': '1' };

/**
 * 拆出「音段部分」和「调值部分」。
 *   'ɭiæŋ²⁴' -> { body: 'ɭiæŋ', tone: '24', level: 2 }
 *   'tʰa53'   -> { body: 'tʰa',   tone: '53', level: 2 }
 *   'a˥˦'     -> { body: 'a',     tone: '54', level: 2 }
 */
export function splitTone(syllable) {
  const s = normalizeTones(syllable);
  const m = s.match(/^([^\d]*?)((?:\d|\u02e5|\u02e6|\u02e7|\u02e8|\u02e9)+)$/);
  if (!m) return { body: s, tone: '', level: 0 };
  const tone = Array.from(m[2]).map(c => LETTER_TONE[c] || c).join('');
  return { body: m[1], tone, level: tone.length };
}

/**
 * 建议的语速。
 *
 * 实测（见 tools/measure-tone-len.mjs）：**espeak 给每个音节固定时长，
 * 不管有几个调值目标** —— 同一速率下
 *     31 = 224ms   313 = 228ms   (1.02×)
 *     53 = 225ms   535 = 225ms   (1.00×)
 * 所以三位调本身并不比二位调长。
 *
 * 早先这里对三位调一律降速到 0.6 倍，本意是让轮廓显现，
 * 但那会让音节变成 1/0.6 ≈ **1.67 倍长**（使用者反馈「几乎长了一倍」）。
 *
 * 现在改成可调因子 THREE_LEVEL_FACTOR：
 *     1.0  不降速（默认）—— 时长与二位调一致，轮廓略扁
 *     0.6  降速 —— 轮廓更清楚，但音节长 1.67 倍
 * 由使用者按需要取舍。
 */
export const THREE_LEVEL_FACTOR = 1.0;

export function suggestRate(tone, baseRate = 140, factor = THREE_LEVEL_FACTOR) {
  const lv = String(tone).length;
  if (lv >= 3 && factor !== 1) return Math.max(60, Math.round(baseRate * factor));
  return baseRate;
}

/**
 * 五度值 → 相对基频的半音偏移。
 * 这是「后处理重画 F0」用的映射；每档 2 半音，5→1 满跨度 8 半音。
 * 想要更夸张的起伏，改 PER_LEVEL 即可。
 */
export const PER_LEVEL = 2;   // 每档半音数

export function levelToSemitone(level) {
  const n = parseInt(level, 10);
  if (!Number.isFinite(n)) return 0;
  return (n - 3) * PER_LEVEL;   // 3 为基准
}

/** 把调值串转成逐点半音序列，例如 '53' -> [4, 0] */
export function toneToSemitones(tone) {
  return Array.from(String(tone)).map(levelToSemitone);
}

/** 常见调值的说明，便于阅读日志 */
export const TONE_SHAPE = {
  '55': '高平', '44': '次高平', '33': '中平', '22': '次低平', '11': '低平',
  '35': '中升', '24': '次低升', '13': '低升', '15': '全升',
  '53': '高降', '42': '次高降', '31': '中降', '51': '全降',
  '213': '低降升', '214': '低降升', '212': '低降升',
  '323': '中降升', '325': '中低升',
  '353': '中升降', '351': '中升降', '523': '高降升', '423': '次高降升',
  '5': '高促', '3': '中促', '2': '低促', '1': '最低促',
};

export function describeTone(tone) {
  if (!tone) return '（无调）';
  return (TONE_SHAPE[tone] || '自定义') + ' [' + tone + ']';
}
