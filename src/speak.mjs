/*
 * speak.mjs — 核心：IPA 串 → 音频
 *
 * 用法：
 *   import { Speaker } from './speak.mjs';
 *   const sp = await Speaker.create();
 *   await sp.saveWav('ɭiæŋ²⁴ nʌm³¹', 'out/demo.wav');
 *
 * 关键事实（全部实测，详见 README）：
 *   1. IPA 必须包在 [[...]] 里 —— 这才是 espeak 的音素输入开关，否则会被当普通文本朗读
 *   2. voice 用 ipa（它的音素表同时收原生 IPA 与 espeak ASCII 助记符）
 *   3. 回调返回 0 = 继续输出，返回 1 = 中止（站点封装是 `?1:0`，容易搞反）
 *   4. 声调数字被当作平调目标序列；三位调需要降速才显现
 *   5. 宽音域变体可通过 FS_createDataFile 在运行时创建（默认用 pitch 80 255）
 */
import fs from 'node:fs';
import path from 'node:path';
import { openEngine, SR } from './engine.mjs';
import { normalizeTones, splitTone, suggestRate } from './tones.mjs';
import { toEspeak } from './ipa-espeak.mjs';
import { trimSilence, mergeWithGap, encodeWav as _encodeWav } from './audio.mjs';

export { trimSilence, mergeWithGap, SILENCE_THR } from './audio.mjs';

/** 默认嗓音变体：pitch <base> <range>。实测比默认音域宽，起伏更接近自然语音。 */
export const DEFAULT_VARIANT = { name: 'wide80', pitch: 'pitch 80 255' };

/* ============================ 静音裁剪 ============================ */
/*
 * 逻辑已抽到 audio.mjs（浏览器与 Node 共用一份）。
 * 那里有完整的实测数据说明为什么必须裁。
 */

const VOICE_DIR = '/usr/local/share/espeak-ng-data/voices/!v';

/* ============================ 零声母补偿 ============================ */
/*
 * 逻辑已统一到 ipa-espeak.mjs（浏览器与 Node 共用一份，避免流程分歧）。
 * 这里只做再导出，保持原有 API 不变。
 */
export { isZeroInitial, ZERO_INITIAL_MODES, prepareBody } from './ipa-espeak.mjs';
import { prepareBody as _prepareBody } from './ipa-espeak.mjs';

export class Speaker {
  constructor(M, opts = {}) {
    this.M = M;
    this.rate = opts.rate ?? 140;
    this.pitch = opts.pitch ?? 40;
    this.baseVoice = opts.baseVoice ?? 'ipa';
    this.variant = opts.variant ?? DEFAULT_VARIANT;
    this.autoRateForTone = opts.autoRateForTone ?? true;
    /** 零聲母補償：'glottal'（預設）| 'length' | 'none' */
    this.zeroInitial = opts.zeroInitial ?? 'glottal';
    /**
     * 合成方式：
     *   'syllable'（預設）逐音節各開一個 [[...]] 塊，可逐音節控速
     *   'block'    整行放進一個 [[...]] 塊 —— 站點原本的作法
     *
     * 實測差異極大（4 音節，率 140）：
     *   block     43196 樣本（每音節約 490ms，塊內連讀）
     *   syllable 105782 樣本（每音節約 1180ms，各自獨立）
     * 站點用 block，所以音節間是連讀的、整體短得多。
     */
    this.mode = opts.mode ?? 'syllable';
    /** 字與字之間額外加的靜音（毫秒）。引擎自帶的長尾巴會被裁掉，這個才是真正的間隔 */
    this.gapMs = opts.gapMs ?? 45;
    this.voice = this.baseVoice;

    if (this.variant) {
      /*
       * 變體優先順序：
       *   1. 若已用 tools/install-variant.mjs 烘焙進 .data，直接用（瀏覽器場景必須如此）
       *   2. 否則在 Node 裡用 FS_createDataFile 運行時創建
       * 兩種情況都設為 ipa+<name>，失敗也不致命（set_voice 對未知 voice 是靜默失敗的）
       */
      if (!Speaker._madeVariants.has(this.variant.name)) {
        try {
          const content = 'language variant\nname ' + this.variant.name + '\n' + this.variant.pitch + '\n';
          M.FS_createDataFile(VOICE_DIR, this.variant.name, new TextEncoder().encode(content), true, true, true);
        } catch (e) {
          // 多半是已經烘焙在 .data 裡了，忽略
        }
        Speaker._madeVariants.add(this.variant.name);
      }
      this.voice = this.baseVoice + '+' + this.variant.name;
    }
  }

  /** 创建并加载引擎 */
  static async create(opts = {}, engineDir) {
    const M = await openEngine(engineDir);
    return new Speaker(M, opts);
  }

  /** 可用 / 已创建的变体名单（便于排查） */
  static _madeVariants = new Set();

  /**
   * 复用的 worker（**不要每次合成 new 一个**）。
   *
   * 原先 `_synthRaw` 每次调用都 `new M.eSpeakNGWorker()` 再 `delete()`，
   * 每次都重新 set_voice —— 而 espeak 的 set_voice 会重新加载整个语音数据。
   * 逐字合成时（3387 字）这会不断增长 WASM 堆且从不回收，直接 OOM。
   * 现在整个 Speaker 共用一个 worker，设置也只在变化时下发。
   */
  _worker() {
    if (!this._w) {
      this._w = new this.M.eSpeakNGWorker();
      this._applied = {};
    }
    return this._w;
  }

  /** 只在设置变化时才下发 —— set_voice 的代价极高 */
  _applySettings(w, rate) {
    const a = this._applied || (this._applied = {});
    if (a.voice !== this.voice) { try { w.set_voice(this.voice); } catch (e) {} a.voice = this.voice; }
    if (a.rate !== rate) { try { w.set_rate(rate); } catch (e) {} a.rate = rate; }
    if (a.pitch !== this.pitch) { try { w.set_pitch(this.pitch); } catch (e) {} a.pitch = this.pitch; }
  }

  /** 释放复用的 worker */
  close() {
    if (this._w) { try { this._w.delete(); } catch (e) {} this._w = null; this._applied = null; }
  }

  /** 合成一段「音素串」（已是 espeak 音素内容，不含 [[ ]]） */
  _synthRaw(phonemes, rate) {
    const M = this.M;
    return new Promise(resolve => {
      const w = this._worker();
      this._applySettings(w, rate ?? this.rate);

      const out = [];
      let n = 0, peak = 0, chunks = 0, settled = false, runaway = false, timer = 0;
      const done = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);                   // 别留待决定时器
        const s = new Float32Array(n);
        let p = 0;
        out.forEach(c => { s.set(c, p); p += c.length; });
        resolve({ samples: s, n, peak, chunks, runaway });
      };

      try {
        w.synthesize('[[ ' + phonemes + ' _: ]]', (d) => {
          if (!d || d.length === 0) { done(); return 0; }
          chunks++;
          const half = Math.floor(d.length / 2);
          const a = new Float32Array(half);
          for (let i = 0; i < half; i++) {
            const v = d[i * 2];
            a[i] = v;
            const av = v < 0 ? -v : v;
            if (av > peak) peak = av;
          }
          out.push(a); n += half;
          if (n > SR * 30) { runaway = true; done(); return 1; }   // 1 = 中止
          return 0;                                                 // 0 = 继续
        });
      } catch (e) { done(); }
      timer = setTimeout(done, 10000);
    });
  }

  /**
   * 合成一串 IPA（音节用空格分隔）。
   * @returns {Promise<Float32Array>}
   */
  async speak(ipa, opts = {}) {
    const syllables = String(ipa).trim().split(/\s+/).filter(Boolean);
    if (!syllables.length) return new Float32Array(0);

    const mode = opts.mode ?? this.mode;
    const parts = [];
    const report = [];

    /* 先把每个音节的 IPA 段转写好（两种模式共用） */
    for (const syl of syllables) {
      const { body, tone } = splitTone(syl);
      const rate = this.autoRateForTone && opts.autoRateForTone !== false
        ? suggestRate(tone, this.rate)
        : this.rate;

      /* 零聲母補償 → 轉寫成 espeak 音素名（与浏览器共用同一份逻辑） */
      const prep = _prepareBody(body, opts.zeroInitial ?? this.zeroInitial);
      const finalBody = prep.text;

      // 调值转成 ASCII 数字后紧跟在音段之后，作为 espeak 的平调目标序列
      const seg = tone ? finalBody + tone : finalBody;
      report.push({
        syllable: syl, body, tone, rate, seg,
        zeroInitial: prep.zeroInitial, compensated: prep.compensated, phonemes: seg,
        ipaBody: prep.ipaBody, espeakBody: finalBody, dropped: prep.dropped,
        n: 0, peak: 0, runaway: false,
      });
    }

    if (mode === 'block') {
      /*
       * 站點原本的作法：整行放進一個 [[...]] 塊，塊內連讀。
       * 代價是無法逐音節控速（三位調的自動降速失效），整行用同一個 rate。
       */
      const line = report.map(r => r.seg).join(' ');
      const res = await this._synthRaw(line, this.rate);
      parts.push(res.samples);
      const per = report.length ? Math.round(res.n / report.length) : 0;
      /* 塊模式下無法逐音節量峰值，整體值填給每個音節並標明 */
      report.forEach(r => {
        r.n = per; r.peak = res.peak; r.runaway = res.runaway;
        r.blockTotal = res.n; r.blockShared = true;
      });
      this.lastReport = report;
      return res.samples;
    }

    /* 逐音節各開一塊（可逐音節控速） */
    const gapMs = opts.gapMs ?? this.gapMs;
    for (const r of report) {
      const res = await this._synthRaw(r.seg, r.rate);
      /* 裁掉引擎自帶的首尾靜音，否則每塊約 0.6 秒的尾巴會累加成很長的字間空檔 */
      const trimmed = opts.trim === false ? res.samples : trimSilence(res.samples, opts.trimOpts);
      parts.push(trimmed);
      if (gapMs > 0) parts.push(new Float32Array(Math.round(SR * gapMs / 1000)));
      r.n = trimmed.length; r.rawN = res.n; r.peak = res.peak; r.runaway = res.runaway;
    }
    this.lastReport = report;

    let total = 0;
    parts.forEach(p => total += p.length);
    const out = new Float32Array(total);
    let off = 0;
    parts.forEach(p => { out.set(p, off); off += p.length; });
    return out;
  }

  /** 合成并返回 WAV（Buffer） */
  async toWav(ipa, opts = {}) {
    const s = await this.speak(ipa, opts);
    return encodeWav(s, SR, opts.normalize !== false);
  }

  /** 合成并写文件 */
  async saveWav(ipa, file, opts = {}) {
    const buf = await this.toWav(ipa, opts);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    return file;
  }

  /** 逐个音节的诊断报告（上一轮的 speak 结果） */
  report() {
    return (this.lastReport || []).map(r =>
      `${r.syllable.padEnd(10)} ${r.body.padEnd(8)}→${(r.espeakBody || '').padEnd(9)} ` +
      `调=${(r.tone || '-').padEnd(4)} rate=${String(r.rate).padStart(3)} ` +
      `${String(r.n).padStart(6)}采样 peak=${r.peak.toFixed(3)}` +
      (r.compensated ? ' [零聲母→' + r.phonemes.replace(/\d+$/, '') + ']' : '') +
      (r.dropped && r.dropped.length ? ' ⚠丟棄' + JSON.stringify(r.dropped) : '') +
      (r.runaway ? ' ✗失控' : r.peak <= 0.002 ? ' ✗静音' : ' ✓')
    ).join('\n');
  }
}

/** 16bit PCM WAV 编码 */
export function encodeWav(samples, sr = SR, normalize = true) {
  let peak = 0;
  if (normalize) for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a; }
  const g = normalize && peak > 0 ? 0.92 * 32767 / peak : 32767;

  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);      // PCM
  buf.writeUInt16LE(1, 22);      // mono
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  let p = 44;
  for (let i = 0; i < samples.length; i++, p += 2) {
    const v = Math.max(-1, Math.min(1, samples[i])) * g;
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), p);
  }
  return buf;
}
