/*
 * index.mjs — 統一入口
 *
 * 快速上手：
 *   import { Speaker } from './src/index.mjs';
 *   const sp = await Speaker.create();
 *   await sp.saveWav('ɭiæŋ²⁴ nʌm³¹', 'out/demo.wav');
 */
export { Speaker, encodeWav, DEFAULT_VARIANT } from './speak.mjs';
export { loadEngine, openEngine, waitReady, SR, defaultEngineDir } from './engine.mjs';
export * as tones from './tones.mjs';
export * as qieyun from './modes/qieyun.mjs';
export { LexiconMode, fromFile as lexiconFromFile } from './modes/lexicon.mjs';
