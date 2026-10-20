/*
 * engine.mjs — 在 Node 里加载 espeak-ng（站点那份构建）
 *
 * 说明：
 *   站点的 espeakng.worker.js 是 CJS 风格的 worker bundle（无 export、无 createRequire），
 *   但内部有 ENVIRONMENT_IS_NODE 分支，会用 require('fs') 读 espeakng.worker.data。
 *   所以用 new Function 注入 require 后即可在 Node 中直接驱动。
 *
 *   引擎暴露的方法（这个构建被裁剪过，没有 get_range/set_range/get_volume）：
 *     get_samplerate  get_rate/set_rate  get_pitch/set_pitch
 *     set_voice  list_voices  synthesize  synthesize_ipa
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/** 引擎输出采样率（固定值，已实测） */
export const SR = 22050;

/** 默认引擎目录（本包内的 engine/） */
export function defaultEngineDir() {
  return path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'engine');
}

/**
 * 加载 espeak-ng 模块。
 * @param {string} engineDir 含 espeakng.worker.js / espeakng.worker.data 的目录
 * @returns {Promise<object>} Emscripten Module（含 eSpeakNGWorker 构造器与 FS_* 函数）
 */
export async function loadEngine(engineDir = defaultEngineDir()) {
  const require = createRequire(import.meta.url);
  const jsPath = path.join(engineDir, 'espeakng.worker.js');
  const dataPath = path.join(engineDir, 'espeakng.worker.data');
  if (!fs.existsSync(jsPath)) throw new Error('找不到引擎: ' + jsPath);
  if (!fs.existsSync(dataPath)) throw new Error('找不到数据: ' + dataPath);

  const src = fs.readFileSync(jsPath, 'utf8');

  /*
   * 引擎內部用 require('fs').readFile('espeakng.worker.data', ...) 讀資料包，
   * 而那個文件名是相對的，會按「進程 CWD」解析 —— 不是引擎目錄。
   * 不動 CWD（會影響呼叫方的相對路徑），改成攔截 require('fs')，
   * 把相對路徑補成引擎目錄下的絕對路徑。
   */
  const pathMod = path;
  const fsShim = new Proxy(fs, {
    get(t, k) {
      if (k === 'readFile') {
        return (p, ...rest) => {
          const abs = (typeof p === 'string' && !pathMod.isAbsolute(p)) ? pathMod.join(engineDir, p) : p;
          return fs.readFile(abs, ...rest);
        };
      }
      return t[k];
    },
  });
  const req = (name) => (name === 'fs' ? fsShim : require(name));

  const factory = new Function(
    'require', 'module', 'exports', '__dirname', '__filename', 'process', 'globalThis',
    src + '\n;return (typeof Module !== "undefined") ? Module : {};'
  );
  const M = factory(req, { exports: {} }, {}, engineDir, jsPath, process, globalThis);

  const ok = await waitReady(M);
  if (!ok) throw new Error('引擎初始化超时');
  return M;
}

/** 等 Emscripten 运行时与数据包就绪 */
export async function waitReady(M, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (M.eSpeakNGWorker && M.calledRun) return true;
    await new Promise(r => setTimeout(r, 80));
  }
  return !!(M.eSpeakNGWorker && M.calledRun);
}

/** 一次性加载并返回一个 Speaker 可用的引擎句柄 */
export async function openEngine(engineDir) {
  const M = await loadEngine(engineDir);
  return M;
}
