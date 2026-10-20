#!/usr/bin/env node
/*
 * cli.mjs — 命令行入口
 *
 * 用法：
 *   node tools/cli.mjs speak "<IPA 串>" [輸出.wav] [--rate 140] [--voice ipa]
 *   node tools/cli.mjs lexicon <字表文件> "<文本>" [輸出.wav]
 *   node tools/cli.mjs derive <音系id> <推導器文件> "<字>"        （需要外部音韻地位提供器）
 *   node tools/cli.mjs check "<IPA 串>"                          只做診斷，不出音頻
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Speaker } from '../src/speak.mjs';
import { splitTone, describeTone, normalizeTones, suggestRate } from '../src/tones.mjs';
import { LexiconMode } from '../src/modes/lexicon.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));

function parseIpa(s) {
  return normalizeTones(s).trim().split(/\s+/).filter(Boolean);
}

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(fs.readFileSync(path.join(ROOT, 'tools', 'usage.txt'), 'utf8'));
    return;
  }

  if (cmd === 'check') {
    const ipa = positional[1];
    if (!ipa) throw new Error('缺少 IPA 串');
    for (const s of parseIpa(ipa)) {
      const { body, tone } = splitTone(s);
      console.log(`${s.padEnd(12)} 音段=${body.padEnd(10)} 調=${(tone || '-').padEnd(5)} ${describeTone(tone).padEnd(10)} 建議rate=${suggestRate(tone, 140)}`);
    }
    return;
  }

  const sp = await Speaker.create({
    rate: Number(flag('rate', 140)),
    pitch: Number(flag('pitch', 40)),
    zeroInitial: flag('zero-init', 'glottal'),
    mode: flag('mode', 'syllable'),
  });

  if (cmd === 'speak') {
    const ipa = positional[1];
    if (!ipa) throw new Error('缺少 IPA 串');
    const out = positional[2] || path.join(ROOT, 'out', 'speak.wav');
    await sp.saveWav(ipa, out);
    console.log('輸入 :', ipa);
    console.log('輸出 :', out);
    console.log('逐音節:');
    console.log(sp.report());
    return;
  }

  if (cmd === 'lexicon') {
    const file = positional[1];
    const text = positional[2];
    if (!file || !text) throw new Error('用法: lexicon <字表文件> "<文本>" [輸出.wav]');
    const out = positional[3] || path.join(ROOT, 'out', 'lexicon.wav');
    const lex = new LexiconMode();
    lex.loadFile(file);
    console.log(`字表 ${file}：收錄 ${lex.size()} 字`);
    const r = await lex.speak(sp, text, {});
    if (!r.ipa) { console.log('沒有可發音的字'); return; }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, r.wav);
    console.log(`文本 : ${text}`);
    console.log(`IPA  : ${r.ipa}`);
    console.log(`輸出 : ${out}`);
    if (r.missing.length) console.log(`未收錄: ${r.missing.join(' ')}`);
    console.log('逐音節:');
    console.log(sp.report());
    return;
  }

  if (cmd === 'derive') {
    const text = positional[1];
    if (!text) throw new Error('用法: derive "<漢字文本>" [輸出.wav] [--deriver 文件] [--phonology 名稱]');
    const out = positional[2] || path.join(ROOT, 'out', 'derive.wav');
    const deriverFile = flag('deriver', null) /* 不再预设方案；用 --deriver 指定 */;

    const Q = await import('../src/modes/qieyun.mjs');
    await Q.useTshetUinh();
    const id = flag('phonology', 'qieyun');
    Q.registerFromFile({ id, name: flag('phonology', '示例切韻'), file: deriverFile });
    console.log(`音系      : ${id}  (${path.basename(deriverFile)})`);
    console.log(`音韻地位源: tshet-uinh\n`);

    const r = await Q.speakText(sp, id, text, {});
    for (const row of r.rows) {
      if (row.err) { console.log(`${row.字}  ✗ ${row.err}`); continue; }
      console.log(`${row.字}  ${(row.描述 || []).join(' / ').padEnd(14)} 反切=${(row.反切 || '').padEnd(6)} → ${(row.ipa || []).join(' ')}`);
    }
    if (!r.ipaText) { console.log('\n沒有可發音的字'); return; }
    console.log(`\nIPA  : ${r.ipaText}`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, r.wav);
    console.log(`輸出 : ${out}`);
    console.log('逐音節:');
    console.log(sp.report());
    return;
  }

  throw new Error('未知命令: ' + cmd);
}
main().catch(e => { console.error('錯誤:', e.message); process.exit(1); });
