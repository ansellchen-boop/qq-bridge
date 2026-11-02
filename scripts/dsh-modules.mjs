// 定位「DSH 安装目录下的 node_modules」—— 供仓库脚本加载 DSH 自身的模块做校验。
//
// 解析顺序：
//   1. 环境变量 DSH_INSTALL_MODULES / DSH_MODULES（应指向 <DSH>/node_modules）
//   2. 从 $DSH_HOME/profiles/<profile>/package.json 用 Node 模块解析反查真实安装位置
//      （探针包全都没装时，退一步用 <profile>/node_modules 目录本身，见函数内注释）
//      （profile 依次尝试 DSH_PROFILE、web、default，再兜底扫 profiles 下的其它目录）
// 全部失败时抛出带指引的错误，不做任何写死路径的回退 —— 宁可显式报错，也不要静默用错版本。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

// 这些脚本需要加载的包，任意一个能解析成功即可反推出 node_modules 位置。
// `@deepseek-ai/dsh-persona` 这包在任何位置都不存在（2026-10-31 实测），
// 移出探针；加 `@deepseek-ai/dsh` —— 内置工具包都在它的 node_modules 里。
const PROBE_SPECIFIERS = ['@deepseek-ai/dsh', 'js-yaml'];

function findNodeModules(resolvedFile) {
  let dir = path.dirname(resolvedFile);
  for (;;) {
    if (path.basename(dir) === 'node_modules') return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** 这个 node_modules 里的 `@deepseek-ai/` 是否有 `dsh-*` 包（= DSH 真装在这儿）。 */
function hasDshPackages(modulesDir) {
  try {
    return fs.readdirSync(path.join(modulesDir, '@deepseek-ai')).some((n) => n.startsWith('dsh-'));
  } catch { return false; }
}

/**
 * 全局 npm 目录候选（2026-10-31 补）。
 * 背景：pnpm 严格依赖下 profile 的 node_modules 里只有直接依赖，
 * DSH 内置工具包全在全局 `@deepseek-ai/dsh/node_modules` 下。
 * 从 process.execPath 反推：<prefix>/bin/node → <prefix>/lib/node_modules。
 */
function globalModuleCandidates() {
  const out = [];
  const binDir = path.dirname(process.execPath);
  const lib = path.join(binDir, '..', 'lib', 'node_modules');
  out.push(path.join(lib, '@deepseek-ai', 'dsh', 'node_modules'));
  out.push(lib);
  // nvm 多版本：把同级每个版本都试一遍（脚本不一定跑在装了 dsh 的那个版本上）。
  try {
    const versionsRoot = path.join(binDir, '..', '..', '..');
    for (const v of fs.readdirSync(versionsRoot)) {
      out.push(path.join(versionsRoot, v, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules'));
    }
  } catch { /* 不是 nvm 布局就算了 */ }
  return out;
}

function candidateProfiles(home) {
  const names = [];
  const add = (n) => { if (n && !names.includes(n)) names.push(n); };
  add(process.env.DSH_PROFILE);
  add('web');
  add('default');
  try {
    for (const e of fs.readdirSync(path.join(home, 'profiles'), { withFileTypes: true })) {
      if (e.isDirectory()) add(e.name);
    }
  } catch { /* profiles 目录不存在时忽略 */ }
  return names;
}

export function dshModulesDir() {
  const override = process.env.DSH_INSTALL_MODULES || process.env.DSH_MODULES;
  if (override) return override;

  const home = dshHome();
  for (const profile of candidateProfiles(home)) {
    const anchor = path.join(home, 'profiles', profile, 'package.json');
    if (!fs.existsSync(anchor)) continue;
    const req = createRequire(anchor);
    for (const spec of PROBE_SPECIFIERS) {
      try {
        const dir = findNodeModules(req.resolve(spec));
        if (dir) return dir;
      } catch { /* 换下一个 specifier，再换下一个 profile */ }
    }
  }
  // 回退（2026-10-31 补）：profile 的 package.json 解析不出上面两个包时（pnpm 严格依赖，
  // 实测 web / headless 都没有 js-yaml，@deepseek-ai 下只有 cosmokit / dsh-tool-web /
  // dsh-util-values / schemastery），改按「哪个 node_modules 里真有 dsh-* 包」来认。
  // 注意：不能退回「profile 的 node_modules 目录存在就用」——那会让
  // collectDshToolNames 扫出一个没有内置工具包的目录，把 55 个真工具名全判成假名
  // （比跳过更糟：测试红着，理由完全是假的）。
  for (const dir of globalModuleCandidates()) {
    if (hasDshPackages(dir)) return dir;
  }

  const err = new Error(
    '无法定位 DSH 安装目录下的 node_modules。\n'
    + '  请设置 DSH_INSTALL_MODULES=<DSH 安装目录>/node_modules 后重试；\n'
    + `  或设置 DSH_HOME 指向 DSH 根目录（当前解析为 ${home}）。`
  );
  // 给调用方一个可判定信号：这是"前提不满足"，不是"实现有 bug"。
  // 干净 clone / CI 上没装 DSH 时应当跳过相关断言，而不是整套变红。
  err.code = 'DSH_MODULES_NOT_FOUND';
  throw err;
}
