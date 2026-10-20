/*
 * ipa-espeak.mjs — IPA → espeak 音素名 的对照表与转换器
 *
 * 表的来源：費寶禮《……》 https://www.bilibili.com/read/cv12314869/
 * 「口口聲聲」站點用的就是這張表。此处原样照录，未作任何改动。
 *
 * 使用方式：
 *     import { toEspeak } from './ipa-espeak.mjs';
 *     toEspeak('ʈæk⁵')  ->  { text: 't.&k5', dropped: [] }
 *
 * 重要（实测确认）：
 *   引擎的音素表里是 *espeak 音素名*，不是原生 IPA。
 *   直接喂 IPA 会出错：例如 tʰ 的 ʰ 不在表里 → espeak 只发 t（不送气），
 *   且输出時長比正確寫法長 20–40%。
 *   所以这一步转换是必需的。
 *
 * 表中没有的符号一律「丢弃」（作者对 ɭ、ħ、ʕ 等即是如此），
 * 并在 dropped 里报出来，不做任何猜测性近似。
 */

/** 原表（照录）。键为 IPA，值为 espeak 音素名。 */
export const IPA_TO_ESPEAK_AUTHOR = {
  '': '',
  'p': 'p',
  'p·': 'p·',
  'pʰ': 'ph',
  'pʱ': 'ph',
  'b': 'b',
  'b·': 'b·',
  'm': 'm',
  'm·': 'm·',
  'm̥ʰ': 'mh',
  't': 't',
  'tʰ': 'th',
  'tʱ': 'th',
  'd': 'd',
  'n': 'n',
  'n̩': 'n',
  'n̥ʰ': 'nh',
  'ʈ': 't.',
  'ʈʰ': 't.h',
  'ɖ': 'd.',
  'ɳ': 'n.',
  'ɲ': 'n^',

  'ȶ': 't.',
  'ȶʰ': 't.h',
  'ȡ': 'd.',
  'ȵ': 'n^',

  'l': 'l',
  "l'": "l'",
  'l̥ʰ': 'lh',
  't͡s': 'ts',
  'ts': 'ts',
  't͡sʰ': 'tsh',
  'tsʰ': 'tsh',
  'tsh': 'tsh',
  't͡sʱ': 'tsh',
  'd͡z': 'dz',
  'dz': 'dz',
  's': 's',
  'z': 'z',
  't͡ʂ': 'ts.',
  'tʂ': 'ts.',
  'ʈ͡ʂ': 'ts.',
  'ʈʂ': 'ts.',
  't͡ʂʰ': 'ts.h',
  'tʂʰ': 'ts.h',
  'ʈ͡ʂʰ': 'ts.h',
  't͡ʂʱ': 'ts.h',
  'd͡ʐ': 'dz.',
  'ʂ': 's.',
  'ʐ': 'z.',
  'nʐ': 'nz.',
  't͡ɕ': 'tS;',
  't͡ɕʰ': 'tS;h',
  'd͡ʑ': 'dZ;',
  'ɕʰ': 'S;h',
  'ɕ': 'S;',
  'ʑ': 'Z;',
  'k': 'k',
  'kʷ': 'kw',
  'kʰ': 'kh',
  'kʰʷ': 'khw',
  'kʱ': 'kh',
  'g': 'g',
  'ɡ': 'g',
  'ɡ·': 'g·',
  'ɡʷ': 'gw',
  'ɡʷ·': 'gw·',
  'ŋ': 'N',
  'ŋ̩': 'N',
  'ng': 'N',
  'ŋʷ': 'Nw',
  'ŋ̥ʰ': 'Nh',
  'ŋ̥ʰʷ': 'Nhw',
  'ʔ': '?',
  'ʔʷ': '?w',
  'h': 'h',
  'hʷ': 'hw',
  'ɦ': 'h.',
  'ɦʷ': 'h.w',

  'ɴ': 'n"',
  'χ': 'X',
  'ʁ': 'g"',

  'q': 'q',
  'qʰ': 'qh',
  'qʰʷ': 'qhw',
  'qʷ': 'qw',
  'ɢ': 'G',
  'ɢʷ': 'Gw',
  'ʀ': 'R',

  'ɓ': 'b`',
  'f': 'f',
  'fʱ': 'fh',
  'v': 'v',
  'ʋ': 'v.',
  'v̩': 'v.',
  'ɗ': 'd`',
  'tʃ': 'tS',
  'tʃʰ': 'tSh',
  'tʃʱ': 'tSh',
  'ʃ': 'S',
  '~ʃ': 'S~',
  'ʃʱ': 'Sh',
  'ʃʰ': 'Sh',
  'dʒ': 'dZ',
  'ʒ': 'Z',
  's͈': 'ss',
  'sʱ': 'sh',
  'c': 'c',
  'k͈': 'kk',
  'x': 'x',
  'ɣ': 'Q',
  'r': 'r',
  "r'": "r'",
  'r·': 'r·',
  'rʷ': 'rw',
  'r̥ʰ': 'rh',

  'ki': 'ki',
  'kq': 'kq',
  'ku': 'ku',
  'mo': 'mo',
  'mu': 'mu',
  'ti': 'ti',
  'tu': 'tu',
  '~': '~',
  '~h': '~?',
  '~ʔ': '~?',
  'ʔ~': '?~',
  'ŋʔ': 'N?',

  'I': 'I',
  'ɪ': 'I',
  'O': 'U.',
  'o̝': 'U.',
  'a': 'a',
  'aː': 'a:',
  'e': 'e',
  'eː': 'e:',
  'i': 'i',
  'i˞': 'ir',
  'iʔ': 'i?',
  'o': 'o',
  'u': 'u',
  'uʔ': 'u?',
  'æ': '&',
  'ɐ': '&"',
  'ɑ': 'A',
  'ɔ': 'O',
  'ə': '@',
  'ɛ': 'E',
  'ɤ': 'o-',
  'ɨ': 'i"',
  'ʉ': 'y"',
  'əɐ': '@&"',
  'ɛɐ': 'E&"',

  'E': 'ee',
  'ᴇ': 'ee',
  'iː': 'i:',
  'oː': 'o:',
  'uː': 'u:',
  'y': 'y',
  'ø': 'Y',
  'œ': 'W',
  'ɘ': '@;',
  'ə˞': '@r',
  'ɯ': 'u-',
  'ɯː': 'u-:',
  'ɿ': 'i"',
  'ʅ': 'u-',
  'ɵ': '@.',
  'ʊ': 'U',
  'ʌ': 'V',
  'ɒ': 'A.',

  'ai': 'ai',
  'au': 'au',
  'ei': 'ei',
  'eu': 'eu',
  'oi': 'oi',
  'æi': '&i',
  'ɐi': '&"i',
  'ɑi': 'Ai',
  'ɑu': 'Au',
  'ɑw': 'Aw',
  'ɒi': 'A.i',
  'əi': '@i',
  'ɛi': 'Ei',
  'ɛu': 'Eu',
  'ɤi': 'o-i',
  'iˠ': 'io-',
  'ɨu': 'i"u',
  'iu': 'iu',

  'æw': '&w',
  'ɔi': 'Oi',
  'ɔw': 'Ow',
  'ow': 'ow',

  'ou': 'ou',
  'ɐu': '&"u',
  'ɐɯ': '&"u-',
  'əu': '@u',
  'əɯ': '@u-',
  'ɵi': '@.i',

  '̩̩̩̩̩n̩': 'n',
  'β': 'u-',
  'z̩': 'i',
  '̩l': 'i"',

  'j': 'j',
  'jw': 'jw',
  'j̈': 'i"',
  'w': 'w',
  'ẅ': 'w"',
  'ɥ': 'y',
  'ɻ': 'r.',
  'ɻj': 'r.j',
  'ɻw': 'r.w',
  'ɻu': 'r.u',
  'ɻɥ': 'r.y',
  'ɻẅ': 'r.w"',
  'ɽ': '*.',

  'ʷ': 'w',
  'ʷi': 'y',
  'ʷj': 'wj',
  'iu̯': 'iw-',
  'u̯': 'w-',
  'ɰ': 'r.',
  'ʷɰ': 'r.w',
  'ɻi': 'r.i',
  'ɻwi': 'r.wi',
  'ʷɻi': 'r.wi',
  'ʷɻ': 'r.w',

  'ɹ': 'r.',

  'ĭ': 'i',
  'ĭu': 'iu',
  'ĭw': 'iw',
  'iw': 'iw',
  'wi': 'wi',
  'ĕ': 'e-',

  'ui': 'ui',

  'ˤ': '',        // 作者注：FIXME 如何實現咽化？—— 目前丢弃
  '.': '·',
  'gʷ': 'gw',

  'r̥': 'rh',
  'r̥̥': 'rh',
  'l̥': 'lh',
  'l̥̥': 'lh',
  'n̥': 'nh',
  'm̥': 'mh',
  'ŋ̊': 'Nh',

  'A': 'V',
  'sw': 'sw',
};

/*
 * ============================================================================
 * 增補表 —— 作者原表裡沒有的 IPA 符號
 * ============================================================================
 *
 * ⚠️ 判據：**只有實測生效的名字才能寫進來。**
 *
 * 曾經的錯誤：拿 `phontab` 裡出現過的音素名當依據。但 `phontab` 收錄的是
 * **所有音素表**（base / base1 / base2 / 各語言表）的名字總和，而 `ipa` 這張表
 * 只用了其中一個子集 —— 名字在 phontab 裡存在 ≠ `ipa` 表認它。
 *
 * 現在的做法：`tools/sweep-phonemes.mjs` 逐個合成 `[[Xa]]` 與基準 `[[a]]` 比對，
 * 取樣本數增量作為判據。已知能用的輔音增量在 800–3200 之間；
 * 被忽略的名字只有 ~95（約 4ms）。實測結果存 `reference/ipa-table-names.json`。
 *
 * 複核指令：`node tools/check-phonemes-live.mjs`
 */
export const IPA_TO_ESPEAK_EXT = {
  // 邊音系 —— 實測 Δ 1684–2868，全部生效
  'ɭ': 'l.',    // Δ1688  卷舌邊近音（正是站點報 ERROR 的那個音）
  'ɬ': 'l#',    // Δ2868  清齒齦邊擦音（實測有摩擦噪音 hf=0.31，真擦音）
  'ʎ': 'l^',    // Δ1684  硬顎邊近音
  // 擦音系 —— 實測生效
  'ç': 'C',     // Δ1659  清硬顎擦音
  'ʝ': 'J^',    // Δ1126  濁硬顎擦音
  // 齒音 —— 實測生效（t[ Δ1554 / d[ Δ785 / n[ Δ1362）
  't̪': 't[',
  'd̪': 'd[',
  'n̪': 'n[',
  /* 由使用者試聽確認的兩項（見 reference/missing-ipa-findings.md）
   * 判據：聽感，不是任何間接指標。 */
  'ʏ': 'Y',      // 「用 Y 完全沒問題」
  'ʕ': '?\\',    // 「ʕ 應改用 ?\」

  /* ------------------------------------------------------------------
   * 以下由使用者逐個試聽判定：「只有一個能用的就留那個」。
   * 每一項都是該符號**唯一**能發出聲的寫法，沒有替代寫法。
   * 音值未必精確（見各條註釋），但比留空丟棄有用。
   * ------------------------------------------------------------------ */
  'ħ': 'Q\\',    // 唯一能發
  'ɸ': 'f[',     // 唯一能發（借用了 f 的發音）
  'ɱ': 'm[',     // 唯一能發（借用 m）
  /* 'ɟ': 'd[' 已撤除 —— 與 d̪ 碰撞，使用者指出「跟別的混了」
     'ʙ': 'b`' 已撤除 —— 與作者的 ɓ 碰撞，使用者決定撤掉雙唇顫音 */
  'ⱱ': 'v[',     // 唯一能發（借用 v）
  'ɾ': 'r',      // 唯一能發。註：與作者表的 IPA r 同名，引擎分不開閃音/顫音；使用者決定不改
  'ɮ': 'l[',     // 唯一能發
  'ʟ': 'L[',     // 唯一能發。註：l^ 已被 ʎ 佔用
  'θ': 's[',     // 唯一能發，但**聽起來不像英語 th**，是齒化的 s
  'ð': 'z[',     // 同上
  /*
   * 送氣符號的通用兜底。
   *   ʰ（清送氣）→ h
   *   ʱ（濁送氣）→ ɦ 的音素名 `h.`
   * ʱ 的處理由 OVERRIDES 統一覆蓋（含作者原表已有的 pʱ tʱ kʱ … 幾條），見該處說明。
   */
  'ʰ': 'h',
  /*
   * 鼻化：組合波浪號 U+0303 → `~`
   *
   * 引擎裏鼻化元音的音素名就是「元音名 + ~」，實測存在這些：
   *     a~ A~ E~ I~ O~ U~ V~ e~ i~ o~ u~ y~   （引擎 1493 個音素名中 55 個含 ~）
   *
   * 作者原表只有 ASCII 的 `~ → ~`，所以**已經寫成 a~ 的能過**；
   * 但預組合字符（ã U+00E3）與組合記號（U+0303）都不在表裏，會被整箇丟掉 ——
   * 而且丟掉之後 `ẽ` 只剩 `e` 的轉寫、甚至整箇消失，等於連元音都沒了。
   *
   * 處理方式見 toEspeak 裏的 nasalExpand：把預組合字符拆成「基元音 + U+0303」，
   * 基元音照常轉換，U+0303 轉成 `~` 接在後面，於是 `ẽ` → `e` + `~` = `e~`。
   */
  '\u0303': '~',
};

/**
 * 音值備註：上表各項的已知偏差。
 * 這些條目能發聲、但音值未必精確 —— 使用時請知悉。
 */
export const EXT_CAVEATS = {
  'ɸ': '發出來借用的是 f（唇齒），不是雙唇',
  'ɱ': '發出來借用的是 m',
  'ⱱ': '發出來借用的是 v',
  'ɾ': '與 IPA r（顫音）共用同一音素名，引擎不分（使用者決定不改）',
  'ʟ': 'L[ 的音值未確認；l^ 已被 ʎ 佔用故不能用',
  'θ': '★ 使用者明確指出「不像英語 th」—— 實為齒化的 s',
  'ð': '★ 同上，實為齒化的 z',
  'ʏ': '與作者表的 ø 共用 Y，兩者引擎分不開（使用者決定保留）',
  'ˤ': '用咽擦音 ?\\ 近似 —— espeak-ng 有 fzd 咽化特徵但無對應音素名',
};

/**
 * 覆盖表：作者取值实测／判定失效、或有更合适写法的项。**最后套用，优先级最高。**
 * 每一條都必须附依据。
 */
export const OVERRIDES = {
  /*
   * ʱ（濁送氣）一律當作 ɦ —— 使用者指定。
   *
   * 作者原表把 ʱ 和 ʰ 一樣處理成清音 h（他在 pʱ 那條自己註明
   * 「清音濁流：輔音本身不帶濁流…FIXME: 此處為清音清流」），
   * 但濁送氣的送氣段是濁的，應該對應 ɦ 而不是 h。
   * ɦ 在本表的音素名是 `h.`（作者原表 ɦ→h.）。
   *
   * 這裡把作者已有的 pʱ tʱ kʱ fʱ sʱ ʃʱ tʃʱ t͡sʱ t͡ʂʱ 幾條
   * 以及沒有條目的 bʱ dʱ ɡʱ ɖʱ dzʱ dʐʱ dʑʱ … 一併覆蓋。
   */
  ...(() => {
    const m = { 'ʱ': 'h.' };
    for (const [k, v] of Object.entries(IPA_TO_ESPEAK_AUTHOR)) {
      if (!k.includes('ʱ')) continue;
      /* 作者的取值都是以 h 結尾（ph / th / kh / fh / Sh …），改成 h. */
      m[k] = v.endsWith('h') ? v.slice(0, -1) + 'h.' : v + 'h.';
    }
    return m;
  })(),
  'ʀ': 'r"',    // 作者用 R（實測 Δ-3，被忽略）；r" 實測 Δ1264 生效
  /*
   * ɑ / ɒ 對調 —— 使用者聽感判定的結果（作者原表 ɑ→A、ɒ→A.）。
   * 對調後：ɑ(不圓唇)→A.，ɒ(圓唇)→A
   */
  'ɑ': 'A.',
  'ɒ': 'A',
  /*
   * ɣ / ʝ 對調 —— 使用者聽感判定（作者原表 ɣ→Q）。
   * 實測支持：Q 重心 5540Hz、J^ 重心 2631Hz（低頻佔 37%）。
   * 硬顎音應比軟顎音亮，故 Q(亮) 才是 ʝ、J^(暗) 才是 ɣ。
   * 對調後：ɣ(軟顎)→J^，ʝ(硬顎)→Q
   */
  'ɣ': 'J^',
  'ʝ': 'Q',
  /*
   * 咽化記號 ˤ → 咽擦音 ?\ 近似 —— 使用者決定。
   * 必須放在 OVERRIDES：作者原表把 ˤ 映射成空串，若放增補表會被它覆蓋掉
   * （合併順序是 EXT → AUTHOR → OVERRIDES，後者勝）。
   */
  'ˤ': '?\\',
};

/**
 * 衝突項：作者原表與上游不一致之處。依「只增不改」原則保留作者取值，僅記錄。
 *
 * 註：`g"`（作者給 ʁ）一度被我誤判為衝突 —— 官方 Kirshenbaum 表 frc 行 uvl 列 vcd
 *     正是 `g"`，作者取值正確，已從衝突項移除。
 */
export const CONFLICTS = {
  'ʀ': { author: 'R',  upstream: 'r"', note: 'phsource `phoneme r" // uvular trill`；R 無 ipa 行，R2 為斯洛伐克/捷克變體' },
  'β': { author: 'u-', upstream: 'B',  note: '作者自標 FIXME，暫以 ɯ 代替；phsource `phoneme B` 為雙唇濁擦音' },
  'ɦ': { author: 'h.', upstream: 'h',  note: '作者用 h.；官方 Kirshenbaum 表 glt 列 vcd 記作 h<?>' },
  'ɕ': { author: 'S;', upstream: 's;', note: 'phsource 同時定義 s; 與 S;，作者取 S;' },
  'ʑ': { author: 'Z;', upstream: 'z;', note: 'phsource 同時定義 z; 與 Z;，作者取 Z;' },
};

/** 合併表：作者原表 + 增補（增補不覆蓋原表已有鍵）+ 覆蓋表（最後套用） */
export const IPA_TO_ESPEAK = { ...IPA_TO_ESPEAK_EXT, ...IPA_TO_ESPEAK_AUTHOR, ...OVERRIDES };

/** 尚未對應到音素名的 IPA（試聽後確認無可用寫法，丟棄） */
export const UNMAPPED = {
  'ɟ': '濁硬顎塞音。候選 d[ 與 d̪ 碰撞（引擎分不開），使用者判定「跟別的混了」→ 撤除',
  'ʙ': '濁雙唇顫音。候選 b` 與作者的 ɓ（內爆音）碰撞，使用者決定撤除',
  'ɜ': '半開央不圓元音。候選與既有音混同，使用者決定不再驗證',
  'ɞ': '半開央圓元音。同上',
  'ɶ': '開前圓元音。同上',
  'ʜ': '清會厭顫音。無候選',
  'ʢ': '濁會厭顫音。無候選',
  'ɘ': '半閉央不圓元音（作者原表已有 @;，此處僅註記）',
};

/**
 * 實測發現：作者原表裡也有失效項（本包引擎的 `ipa` 表不認）。
 * 依「只增不改」原則未動作者取值，但列在這裡供查證。
 * 判據同增補表：合成 `[[Xa]]` 的增量。
 */
export const AUTHOR_DEAD = {
  'u':   { author: 'u',  note: '實測增量 ~103，被忽略。**常用元音，影響大**' },
  'i':   { author: 'i',  note: '實測增量 ~104，被忽略。**常用元音，影響大**' },
  'ʊ':   { author: 'U',  note: '實測被忽略' },
  'ɯ':   { author: 'u-', note: '實測被忽略' },
  'ʅ':   { author: 'u-', note: '同上' },
  'β':   { author: 'u-', note: '作者自標 FIXME；u- 本身也被忽略' },
  'ʀ':   { author: 'R',  note: 'R 被忽略（可改用 r"，實測 Δ1264 生效）' },
  'ɢ':   { author: 'G',  note: 'G 被忽略' },
  'ɢʷ':  { author: 'Gw', note: 'G 被忽略' },
  'uʔ':  { author: 'u?', note: 'u 被忽略' },
  'mu':  { author: 'mu', note: 'u 被忽略' },
  'tu':  { author: 'tu', note: 'u 被忽略' },
  'ɻu':  { author: 'r.u', note: 'u 被忽略' },
  'iˠ':  { author: 'io-', note: 'o- 被忽略' },
  'ɐɯ':  { author: '&"u-', note: 'u- 被忽略' },
  'əɯ':  { author: '@u-', note: 'u- 被忽略' },
  'iu̯': { author: 'iw-', note: 'w- 被忽略' },
  'u̯':  { author: 'w-',  note: 'w- 被忽略' },
};

/* 反向表：espeak 音素名 → IPA（同音素名可能对应多个 IPA，取第一个） */
export const ESPEAK_TO_IPA = (() => {
  const m = new Map();
  for (const [ipa, esp] of Object.entries(IPA_TO_ESPEAK)) {
    if (!esp || m.has(esp)) continue;
    m.set(esp, ipa);
  }
  return m;
})();

/* 最长优先匹配：按码点长度降序 */
const KEYS = Object.keys(IPA_TO_ESPEAK).filter(k => k !== '').sort((a, b) => {
  const la = Array.from(a).length, lb = Array.from(b).length;
  return lb - la;
});

/*
 * 上標數字 → ASCII。
 *
 * 為什麼必須做：espeak **不認上標數字**。若把 `tʂɨk⁵` 直接餵進去，
 * 上標 ⁵ 會被當成不認識的字符處理，實測多出 0.14–0.27 秒的額外聲音
 * （聽起來像韻尾後面增生了一個 ə）：
 *     [[ then53 ]]  26695 樣本   ← 正確
 *     [[ then⁵³ ]]  31298 樣本   ← 多 4603
 * 推導器輸出的是上標，所以這一步不能省。
 */
const SUP_DIGIT = {
  '\u2070': '0', '\u00b9': '1', '\u00b2': '2', '\u00b3': '3', '\u2074': '4',
  '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9',
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
};

/** 把上標／全角數字歸一化成 ASCII */
export function toAsciiDigits(s) {
  let out = '';
  for (const ch of String(s)) out += (SUP_DIGIT[ch] ?? ch);
  return out;
}

/* 直接透传的字符：ASCII 数字、空白、以及 espeak 的停顿/控制记号 */
const PASS = new Set(Array.from(
  '0123456789' +
  '\u02e5\u02e6\u02e7\u02e8\u02e9' +                                  // ˥˦˧˨˩
  ' \t_.:;^"\'`~·'
));

/**
 * 預組合字符展開：拆成「基字符 + 組合記號」。
 *
 * 為什麼需要：表裏收的是**單一碼位**的字符，預組合字符（ã U+00E3、
 * ự U+1EF1 這類）一個都不在表裏，於是整箇被丟掉 ——
 * 連帶把基元音也丢了（`ẽ` 直接消失，不是變成 `e`）。
 * 拆開之後基元音照常轉換，組合記號裏 `U+0303` 轉成 `~` 接在後面，
 * 於是 `ẽ` → `e` + `~` = `e~`，正是引擎認得的鼻化音素名。
 *
 * 三條規矩，都是為了**不改動既有行為**：
 *   1. 表裏已經有這個字符 → 不動（ASCII 的 `a~` 走原路）
 *   2. 只有 NFD 真的分解出東西才展開
 *   3. 基字符必須本身可轉換；不可轉換時試一次小寫
 *      （Ũ → U 不可轉換 → 試 u → u~；大寫本就不是 IPA 標準寫法）
 *
 * 基字符不可轉換、且小寫也不行時返回 null，原樣留着照常報 dropped。
 *
 * @returns {string|null} 展開後的字串；不需展開時返回 null
 */
function decomposeChar(ch) {
  if (IPA_TO_ESPEAK[ch] !== undefined) return null;
  const nfd = ch.normalize('NFD');
  if (nfd.length < 2) return null;
  let base = nfd[0];
  if (base === '\u0303') return null;
  if (IPA_TO_ESPEAK[base] === undefined && !PASS.has(base)) {
    const lower = base.toLowerCase();
    if (lower !== base && (IPA_TO_ESPEAK[lower] !== undefined || PASS.has(lower))) base = lower;
    else return null;
  }
  return base + nfd.slice(1);      // 其餘組合記號原樣保留（表裏沒有就會照常報 dropped）
}

/**
 * IPA 串 → espeak 音素串。
 *
 * 三步正規化：
 *   1. 去掉連接符（tie bar，U+0361 / U+035C）——
 *      表裡同時收了 `t͡s` 與 `ts` 兩種寫法，碼位未必一致，統一去掉最穩妥
 *      （實測 `t͡ʃ`→`tʃ`→`tS`）。
 *   2. 上標數字轉 ASCII —— espeak 不認上標，不做這步會多出額外聲音（見上）。
 *   3. 預組合字符拆成「基字符 + 組合記號」，使鼻化等特徵得以保留（見 decomposeChar）。
 *
 * @param {string} ipa
 * @returns {{ text: string, dropped: string[], kept: number }}
 *   dropped 裡是表中沒有、因而被丟棄的符號（不做近似替換）
 */
export function toEspeak(ipa) {
  const raw = toAsciiDigits(String(ipa)).replace(/[\u0361\u035c]/g, '');
  const chars = [];
  for (const ch of raw) {
    const exp = decomposeChar(ch);
    if (exp) chars.push(...exp); else chars.push(ch);
  }
  const out = [];
  const dropped = [];
  let kept = 0;
  let i = 0;
  while (i < chars.length) {
    /* 最长优先 */
    let matched = null;
    for (const k of KEYS) {
      const kc = Array.from(k);
      let ok = true;
      for (let j = 0; j < kc.length; j++) if (chars[i + j] !== kc[j]) { ok = false; break; }
      if (ok) { matched = k; break; }
    }
    if (matched !== null) {
      out.push(IPA_TO_ESPEAK[matched]);
      i += Array.from(matched).length;
      kept++;
    } else if (PASS.has(chars[i])) {
      out.push(chars[i]);
      i++;
    } else {
      dropped.push(chars[i]);
      i++;
    }
  }
  return { text: out.join(''), dropped, kept };
}

/** 转换并丢掉数字调的辅助：只转换音段部分 */
export function toEspeakBody(body) {
  return toEspeak(body);
}

/* 所有可能的取值，按长度降序（用于把音素串切回一个个音素名） */
const VALUE_KEYS = [...new Set(Object.values(IPA_TO_ESPEAK).filter(Boolean))]
  .sort((a, b) => b.length - a.length);

/**
 * 把轉寫結果切回一個個音素名（僅供顯示）。
 *
 * 必要性：有些音素名自帶符號，黏在一起看不清 ——
 * 例如 ɑ 的音素名是 `A.`（含點號），`ɑŋ` → `A.` + `N` = `A.N`，
 * 直接顯示會誤以為是三段。切成 `A. N` 就清楚了。
 *
 * 注意：這只是顯示用。餵給引擎的字串仍是原樣，不能加空格。
 * @returns {string} 以空格分隔的音素名
 */
export function segmentPhonemes(esp) {
  const out = [];
  let i = 0;
  while (i < esp.length) {
    if (/[0-9\u2070-\u2079\u02e5-\u02e9]/.test(esp[i])) { out.push(esp[i]); i++; continue; }
    let hit = null;
    for (const v of VALUE_KEYS) { if (esp.startsWith(v, i)) { hit = v; break; } }
    if (hit) { out.push(hit); i += hit.length; }
    else { out.push(esp[i]); i++; }
  }
  return out.join(' ');
}

/* ============================ 零聲母補償 ============================ */
/*
 * 問題：首音直接是元音的音節（/a/、/i/）沒有起首輔音段，
 *       引擎少產出約 80ms，聽感明顯偏短。
 *       實測（聲調 53，rate 140）：
 *         零聲母  a=1029ms i=1028ms u=1028ms   均值 1029
 *         有起首  ja=1143 ʔa=1114 ʔi=1118      均值 1110
 *
 * 補償方式（實測結果）：
 *         'glottal'  前加 ʔ   -> a=1114ms i=1114ms   ★ 與有起首均值吻合且一致
 *         'length'   首元音加長 -> a=1119ms i=1066ms   不一致
 *         'none'     不補償
 *
 * 注意：此判斷必須在「轉寫之前」、對原生 IPA 做。
 */
const VOWEL = new Set(Array.from('iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ'));

/** 首音即元音 ⇒ 零聲母 */
export function isZeroInitial(body) {
  const first = Array.from(String(body))[0];
  return !!first && VOWEL.has(first);
}

export const ZERO_INITIAL_MODES = {
  glottal: { desc: '前加喉塞 ʔ', apply: (body) => 'ʔ' + body },
  length:  { desc: '首元音加長音符號', apply: (body) => body.replace(/^([^\s:]*?)([iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ])/, '$1$2:') },
  none:    { desc: '不補償', apply: (body) => body },
};

/**
 * 完整的前處理：零聲母補償 → 轉寫成 espeak 音素名。
 * 瀏覽器與 Node 兩邊共用，避免流程分歧。
 * @returns {{ text: string, dropped: string[], compensated: boolean, zeroInitial: boolean, ipaBody: string }}
 */
export function prepareBody(body, zeroInitialMode = 'glottal') {
  const zero = isZeroInitial(body);
  const compensated = zero && zeroInitialMode !== 'none' && !!ZERO_INITIAL_MODES[zeroInitialMode];
  const ipaBody = compensated ? ZERO_INITIAL_MODES[zeroInitialMode].apply(body) : body;
  const conv = toEspeak(ipaBody);
  return { text: conv.text, dropped: conv.dropped, compensated, zeroInitial: zero, ipaBody };
}
