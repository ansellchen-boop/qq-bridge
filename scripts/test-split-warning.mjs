// 回归：findSplitBoundaryWarning 的分条断点判断不能误报完整句。
// 做法是从 src/bridge.js 源码里抠出函数本体（含 isCjkLikeChar 依赖）在 vm 里跑，
// 这样测的是线上真正生效的那段代码，而不是另抄一份逻辑。
// 跑：node scripts/test-split-warning.mjs   （失败 exit 1，可直接接进 test:audit）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "src", "bridge.js");
const src = fs.readFileSync(SRC, "utf8");

function grab(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`找不到 function ${name}（函数被改名或删了？）`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error(`${name} 花括号没配平`);
}

const findSplitBoundaryWarning = new Function(
  `${grab("isCjkLikeChar")}\n${grab("findSplitBoundaryWarning")}\nreturn findSplitBoundaryWarning;`
)();

// 期望 warn = 真「一句话被拆成两条」；期望 ok = 正常分条，不许报警。
const cases = [
  ["真实样本：自我介绍 + 补昵称梗", "ok", ["不是啦 我是 DeepSeek 呀", "名字被你改成 Claude大肥鱼了 我才顶着这个昵称"]],
  ["真实样本：装不来 + 我是谁", "ok", ["这个装不来诶，张嘴就露馅了", "我是 DeepSeek 的芯，换不了呀"]],
  ["真半句：逗号结尾", "warn", ["我先说个前提，", "这问题得分两步看"]],
  ["真半句：连接词结尾", "warn", ["他昨天没来是因为", "路上堵了两小时"]],
  ["完整句：了结尾", "ok", ["下班了", "现在回家"]],
  ["完整句：的结尾", "ok", ["这不太像我的", "你再看看"]],
  ["完整句：呀结尾", "ok", ["好呀", "走吧"]],
  ["真半句：2 字连接词（旧版漏报）", "warn", ["因为", "他没来"]],
  ["真半句：但是结尾", "warn", ["他没说清楚 但是", "我觉得还行"]],
  ["完整：两条独立", "ok", ["今天好热", "我快化了"]],
  ["单条不报", "ok", ["只有一条"]],
  ["逗号结尾 + 英文开头仍报", "warn", ["我先说个前提，", "OK 那我说"]],
];

let fail = 0;
for (const [name, expect, msgs] of cases) {
  const r = findSplitBoundaryWarning(msgs);
  const got = r === null ? "ok" : "warn";
  if (got !== expect) fail++;
  console.log(`${got === expect ? "✔" : "✘"} ${name} | 期望 ${expect} 实际 ${got}`);
}
console.log(`\n${cases.length - fail}/${cases.length} 通过`);
if (fail) {
  console.error(`\n失败 ${fail} 条：分条断点判断又退回误报/漏报了`);
  process.exit(1);
}
