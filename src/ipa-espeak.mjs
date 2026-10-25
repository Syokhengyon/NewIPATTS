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
  /* 'ç': 'C' 已移入 OVERRIDES —— C（德語 ich）在本包裁剪過的 .data 裏只有 -48dB，
     改用 xj 後 -36dB，見 OVERRIDES「硬顎音改用軟顎音 + 介音」一組 */
  /* 'ʝ': 'J^' 已移入 OVERRIDES —— 官方 J^ 正是 ipa ʝ，但為了與 ç→xj 的清濁配套，
     改用 Q+j（x ↔ Q 是 phsource 裏的 voicingswitch 對），見 OVERRIDES 的 ɣ/ʝ 一組 */
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
  'ħ': 'H',      // ★ Kirshenbaum 的 ħ 就是 H；舊值 Q\ 有誤（見下）
  /*
   * ⚠ 舊值 `Q\` 是錯的：`Q\` 不在引擎的音素名表裏（表裏只有 Q、Q^、Q"、\），
   *   會被拆成 `Q` + `\` 兩個音素，實測與 `Q`（ɣ，濁軟顎擦音）幾乎一樣
   *   —— 清咽擦音發成了濁軟顎擦音，所以聽着很怪。
   * 改成 `H`（Kirshenbaum 的 [ħ]）後實測：前 60ms 最響塊 −20dB，
   *   比 h（−35dB）、X（χ，−40dB）、Q\（−30dB）都響，是這批裏最好的。
   */
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
  'c': '用 k+j 實現，部位略偏軟顎，並多一個 j 過渡（原 `c` 幾乎無聲，見 OVERRIDES）',
  'cʰ': '用 k+h+j 實現，同上',
  'ç': '用 x+j 實現，比原 `C` 響 12dB，但部位偏軟顎',
  'ɟ': '用 g+j 實現，部位略偏軟顎；濁音本體（g）帶音，聽感接近濁硬顎塞音',
  'ʝ': '用 Q+j 實現（Q 是濁軟顎擦音 ɣ），部位偏軟顎；官方 J^ 本身才是 ipa ʝ，備選 Q^',
  'ɣ': '按官方索引 Q 才是 vcd vel frc，但 Q 在這份資料裏只剩低頻濁音（重心 480Hz、<500Hz 佔 56%），聽着像滑音；改用 g"（重心 752Hz、有 120ms 摩擦段）',
  'ħ': '取 H（Kirshenbaum 的 [ħ]）；舊值 Q\\ 其實是 Q + \\，發成濁軟顎擦音',
  'ʁ': '按官方 `ipa ʁ` 取 Q"；作者原表給的 g" 在 phsource 裏沒有定義，實測只有 −41dB 且發悶',
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
   * a / ɑ / ɒ 三者的對應 —— 使用者反覆試聽後的最終判定（2026-10）。
   *
   *     IPA a  → espeak A.
   *     IPA ɑ  → espeak a
   *     IPA ɒ  → espeak A
   *
   * 為什麼動 a：`phoneme a` 在 phsource 裏自己註明是英語 TRAP 元音（`// tr**a**p`），
   * 音值 [æ]，比漢語的 [a] 前得多 —— 這也是「a 聽着舌位怪」的來源。
   *
   * 沿革：作者原表是 a→a、ɑ→A、ɒ→A.；後來 ɑ/ɒ 先按聽感對調成 ɑ→A.、ɒ→A，
   * 這一版再把 a 與 ɑ 對調，得到上面三條。
   *
   * 註：A / A. 在本包的 phsource 子集裏沒有定義（只有 `phoneme a` 有），
   * 所以這三條的音值**只能靠聽感定**，不是索引推導出來的 —— 別再按 Kirshenbaum
   * 的 A=ɑ、A.=ɒ 去改回來。判定過程見 reference/missing-ipa-findings.md。
   */
  'a': 'A.',
  'ɑ': 'a',
  'ɒ': 'A',
  /*
   * ɣ 改用 g" —— 使用者聽感：`Q` 有揮之不去的 /j/ 音色。
   *
   * 實測（起頭 40ms 的頻譜分佈）：
   *   Qa   最響塊 −28dB  重心 480Hz   <500Hz 佔 56%   1.5–3.5kHz 只佔 2%
   *        → 幾乎全是低頻濁音（不是擦音噪音），耳朵會聽成 j / ɰ 那類滑音
   *   g"a  最響塊 −33dB  重心 752Hz   <500Hz 佔 42%   持續約 120ms 的摩擦
   *        → 有摩擦段，更像 [ɣ]
   * 註：`phoneme Q` 的實現是 `FMT(voc/Q_) addWav(vocw/Q)`，裁剪後的 .data 缺採樣，
   *     只剩共振峰合成 —— 所以它「聽着像滑音」是資料問題，不是選錯音素名。
   *     這也是為什麼官方索引（Q = vcd vel frc = ɣ）對、但聽感不對。
   */
  'ɣ': 'g"',
  /*
   * ʝ 用 Q + j —— 與 ç→xj 配套（phsource 裏 x ↔ Q 正是清濁對），使用者聽感「還可以」，保持。
   * 實測（5ms 能量塊，元音 −13dB 作標尺）：
   *   J^a（官方 ʝ） −22dB / 640Hz    Qja −22dB / 578Hz
   *
   * —— 備選（待試，改下面那一行即可）——
   *   'ʝ': 'J^'   官方正解：`phoneme J^` 就寫着 ipa ʝ，−22dB / 640Hz
   *   'ʝ': 'Q^'   濁軟顎擦音的顎化變體（f2=2700，比 Q 的 2300 亮），−22dB / 555Hz，不拖 j
   */
  'ʝ': 'Qj',
  /*
   * ʁ 改用 Q" —— 作者原表給的是 g"。
   *
   * phsource 裏**沒有** `phoneme g"`，而 `phoneme Q" { vcd uvl frc, ipa ʁ }` 官方明寫 ipa ʁ
   * （清音搭檔是 `X { vls uvl frc, voicingswitch Q" }` = χ）。
   * 實測（起頭 40ms，元音 −13dB 作標尺）：
   *   g"a  −33dB / 752Hz（另有用途：ɣ 已改用 g"）
   *   Q"a  −22dB / 639Hz   正常的濁擦音，且官方就寫着 ipa ʁ
   * 所以 ʁ → Q"、ɣ → g"，兩個各得其所。
   */
  'ʁ': 'Q"',
  /*
   * 咽化記號 ˤ → 咽擦音 ?\ 近似 —— 使用者決定。
   * 必須放在 OVERRIDES：作者原表把 ˤ 映射成空串，若放增補表會被它覆蓋掉
   * （合併順序是 EXT → AUTHOR → OVERRIDES，後者勝）。
   */
  'ˤ': '?\\',
  /*
   * ===== 硬顎音改用「軟顎音 + 介音」實現 =====
   *
   * 起因：使用者聽感上分不出「舌面中」檔的 c / cʰ / ç。
   *
   * 實測（5ms 能量塊的聲母段峰值；元音本體 -13dB 作標尺）：
   *   ca（音素 c）  -49dB  ← 幾乎無聲
   *   Ca（音素 C）  -48dB  ← 幾乎無聲
   *   kja          -45dB，另多一段 j 過渡（-30dB）
   *   xja          -36dB
   *   gja          -30dB
   * 原因同 README 第五節：.data 被裁剪，c 與 C 的採樣不全，只剩極弱的爆發／摩擦；
   * 而 k / x / g / j 的資料完整，響度正常。
   *
   * 所以：c → kj、cʰ → khj、ç → xj、ɟ → gj。
   * 音值代價：部位略偏軟顎，多一個 j 過渡；但至少發得出、三檔之間聽得出區別。
   * 註：espeak 的顎化標記 `'`（k' / x' / g'）也生效，但只改過渡、不加音段；
   *     若哪天覺得 j 太搶耳，可換成 k' / x' / g'（實測長度不變）。
   */
  'c': 'kj',
  'cʰ': 'khj',
  'ç': 'xj',
  'ɟ': 'gj',
  /*
   * ===== /iw/ /ɨw/ 的時長補償 =====
   *
   * 問題：這兩個韻母的有聲時長只有 122ms，而同一韻腹帶別的韻尾都正常
   *   （in 189、im 208、iŋ 205），不帶韻尾的 i 也有 169。
   *
   * 實測（tools 裏的臨時腳本量的，數據記在這裏）：
   *   [[ iw53  _: ]]  122ms   ← 太短
   *   [[ i:w53 _: ]]  217ms   ← 正常
   *   [[ i w53 _: ]]  221ms
   *   [[ i"w53 _: ]]  122ms   ← 太短
   *   [[ i":w53 _: ]] 159ms   ← 只恢復一部分，不夠
   *   [[ i" w53 _: ]] 220ms   ← 正常
   *   [[ uw53  _: ]]  198ms   ← u 不縮（u 和 w 幾乎同部位）
   *   [[ aj53  _: ]]  283ms   ← 反而偏長
   *
   * 原因：espeak 對滑音的處理不對稱。`j` 的 phflags 帶 0x070000 那一組，
   *   被當成「元音性滑音」要佔時長；`w` 只有 0x02，被當成「真滑音」，
   *   會搶走前面元音的時間。所以高元音 + w 縮、非高元音 + j 長。
   *
   * 修法：兩條都用過，因為效果不同 ——
   *   iw  → i:w    加長音符號，217ms，與原音的軌跡差異 0.145（比加空格小）
   *   ɨw  → i":w   加長音符號，159ms。
   *
   * ⚠ ɨw 這裡改過一次：先用了 `i" w`（加空格，220ms），
   *   但使用者聽下來「還是有問題」，所以改回長音符號。
   *   雖然量出來只有 159ms（比 220 短），但音質更接近原音 ——
   *   **聽感優先於時長數字**，這是本專案反覆驗證過的教訓。
   *
   * ⚠ 只改這兩個。ew(189) ɑw(198) iew(231) 都正常，改了就破壞。
   */
  'iw': 'i:w',
  'ɨw': 'i":w',
  /*
   * ===== /y/ + 韻尾 → /yi/ + 韻尾 =====
   *
   * 為什麼：`y` **只存在於 fr 等 28 張表，`ipa` 和它的父表 `base1` 都沒有**。
   *   所以 `-v ipa` 下的 `[[ y ]]` 靠 espeak 的「跨表回退」取得。
   *   回退來的音素能正常發元音，但它的「元音→韻尾」過渡是照原表的上下文編的，
   *   放到 `ipa` 表裏跟 p/t/k/j 相接就不成立 —— 韻尾明顯弱化。
   *
   *   證據：
   *     · 單獨發 y 正常（206ms），使用者聽感也確認「y 後面不跟韻尾比較正常」
   *     · y + 塞音尾只有 149ms（同一韻腹帶鼻音尾是 226ms、帶 -j 是 282ms）
   *     · 換到 `-v fr`（y 的原生表）下，同一個 yk 明顯更完整
   *     · 原生音素不受影響：ik 74ms 有清晰的爆破（尾段高頻 17%），
   *       而 y 的尾段高頻只有 5% —— 和 a/u 這類低元音的 4% 同級，
   *       說明 [y] 該有的高頻成分沒出來
   *
   * 修法：配 p t k ʔ j 時把 y 換成 yi（雙元音）。
   *   yi 是 ipa 表原生的 i 序列，過渡正常；實測 yi+k 的尾段高頻 17%，
   *   和 i+k 完全一致。
   *
   * ⚠ 只在有韻尾時換。ya / yi / yen / yɑŋ 這些**不動** ——
   *   沒有韻尾相接的場合 y 本身是正常的，換了反而破壞音質。
   */
  'yp': 'yip',
  'yt': 'yit',
  'yk': 'yik',
  'yʔ': 'yi?',
  'yj': 'yi',
  /*
   * ===== ɜ 用長音補 =====
   *
   * 使用者的要求：引擎沒有短音的 ɜ，那就「用長音補上」。
   *
   * ⚠ 不能用 `3:` —— 實測 `[[ 3 ]]` 和 `[[ 3: ]]` 在 `-v ipa` 下
   *   **是完全靜音**（峰值 0.000，但有 510ms 的長度）。
   *   原因：`3` 不在 `ipa` 表的 255 個音素裏，也不在父表 `base1` 裏
   *   （之前以為 base1 有 `3`，實測是靜音，說明回退也失敗）。
   *   所以任何 `3` 開頭的寫法都不能用。
   *
   * 改用 `@:`（əː）—— 中央元音加長音符號。
   *   · 發聲正常：峰值 0.706、有聲 217ms
   *   · 音值最接近：[ɜ] 是半開央不圓，`@` 對應的 [ə] 是央中不圓，
   *     比 `E:`（ɛː，偏前）和 `V:`（ʌː，偏後）都接近
   *   · 有聲時長 217ms，和 `a`(207)、`A.`(218) 一個量級，不會拖得突兀
   *
   * 代價：`@` 比 `ɜ` 略閉一點 —— 是近似，不是精確對應。
   */
  'ɜ': '@:',
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
  /*
   * ⚠ ɟ 已於此版補上：改用 g+j（見 OVERRIDES「硬顎音改用軟顎音 + 介音」一組）。
   *   原註記：濁硬顎塞音。候選 d[ 與 d̪ 碰撞（引擎分不開），使用者判定「跟別的混了」→ 撤除
   */
  'ʙ': '濁雙唇顫音。候選 b` 與作者的 ɓ（內爆音）碰撞，使用者決定撤除',
  /*
   * ⚠ ɜ 已於此版補上（用長音符號 `3:`），見 OVERRIDES 的「ɜ 用長音補」一組。
   *   原註記：半開央不圓元音。候選與既有音混同，使用者決定不再驗證
   */
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
  'ɢ':   { author: 'G',  note: '★ 前註「G 被忽略」有誤：實測 Ga 的聲母最響塊 −34dB（g 為 −29dB、b −37dB），是正常的濁塞音爆破。「Δ 增量」判據對塞音不成立（元音同理，見 tools/check-chart.mjs 的註釋）' },
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
