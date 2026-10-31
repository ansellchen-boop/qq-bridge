// 【你昨晚】注入层：把 bili-whale 的夜间活动聚合成一个前缀段，拼进发往 DSH 的 prompt。
//
// 数据源：~/.dsh/surfcore/bili/night-digest.json（由 /root/bili-whale/tools/commands/night-digest.mjs
// 聚合 clock/wake/nurture/watch-history/whale-log/quota 六份日志生成）。
//
// 三条铁律（对应 ROADMAP 三期 3.2.2 的硬约束）：
//   1. 只念日志里真有的。字段缺了就不说，绝不补一句「好像还看了…」。
//   2. 没数据不注入：文件读不到、摘要 hasActivity 为假、或那晚什么都没干 → 返回空串，整段消失。
//   3. 有 token 预算：整段 ≤ 约 200 汉字（两个视频 + 一句交代就封顶）。
//
// 注入位置是 user message 前缀（bridge.js 的 withSlangContext 里，紧跟【当前时间】），
// 所以末尾必带一句「这不是用户说的话」——否则模型会把它当成用户提的要求。
//
// 部署/漂移兜底：scripts/apply-yesterday-inject.py（本地留档 bridge-src/ 是唯一真相源）。
//
// ── 结构（2026-10-30 重构，对外行为字节级不变）────────────────────────────
// 对外三件东西：
//   renderLine(digest, nowMs)  纯函数，喂摘要 + 时间戳，出文案。不碰 IO、不看真实时钟。
//   createNightDigest(deps)    工厂，依赖全从参数进：readFile / stat / regenerate / now / warn
//                              （外加 digestPath / scriptPath / cacheTtlMs）。
//   buildYesterdayLine()       默认单例的零参入口，bridge.js 只认这个，一行都不用改。
//
// 为什么这么拆：原来 buildYesterdayLine() 是 0 参数，背后却压着 fs、时钟、spawn 三个不可见
// 依赖 + 两个模块级 let（retryAt / warnedAt）。后果是测试只能靠改 process.env 和轮流写临时
// 文件，且用例之间靠残留状态互相影响（第 3 个用例设了 retryAt，后面全靠它挡着不去 spawn）
// ——顺序一换结果就可能变。现在每个用例造一个新实例，状态天然独立。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const DEFAULT_DIGEST = path.join(os.homedir(), '.dsh', 'surfcore', 'bili', 'night-digest.json');
const DEFAULT_SCRIPT = '/root/bili-whale/tools/commands/night-digest.mjs';
// 主动提一句的记账文件（跳过/提过都要落盘，否则一晚会被掷好几次骰）
const DEFAULT_POSTED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'state', 'digest-posted.json');

// 3.2.3 主动提一句：一晚掷一次 0.4。
// 别按「每次判定都掷」理解——proactiveCheck 每晚有 3–4 次判定窗口，
// 1-(1-0.4)^3.5 ≈ 0.83，会变成几乎每晚必说，跟「十晚四次」差一个量级。
const POST_PROBABILITY = 0.4;
// 凌晨 2–8 点一律不开口（这个窗口内连骰都不掷，免得白耗一晚的机会）
const QUIET_FROM_HOUR = 2;
const QUIET_TO_HOUR = 8;

// 生成失败后的冷却：避免每轮 prompt 都去 spawn 一次 node 把事件循环卡住。
const RETRY_COOLDOWN_MS = 10 * 60 * 1000;
const WARN_INTERVAL_MS = 60 * 60 * 1000;
const SPAWN_TIMEOUT_MS = 10 * 1000;
// 摘要一天只生成一次。上游 bridge.js 在有图消息里会连着调两次 withSlangContext
// （bridge.js:9336-9339 与 :11346-11349），缓存把第二次的读盘 + 解析省掉。
// 只认「文件没变」的缓存：mtime/size 一变立刻重读，所以测试改完文件马上能看到新内容。
const CACHE_TTL_MS = 30 * 1000;

function dayKey(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function hhmmss(iso) {
  const ms = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 标题来自 B 站，属于不可信外部文本：去换行、去零宽、把【】降级，再截断。
function safeText(value, max) {
  const flat = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, ' ')
    .replace(/【/g, '[')
    .replace(/】/g, ']')
    // 方括号是「段落标记」的形状，容易被读成系统指令，一律降级成普通括号
    .replace(/\[/g, '（')
    .replace(/\]/g, '）')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function formatDuration(sec) {
  const total = Math.round(Number(sec) || 0);
  if (total <= 0) return '';
  if (total < 60) return `${total}秒`;
  return `${Math.floor(total / 60)}分${String(total % 60).padStart(2, '0')}秒`;
}

/**
 * 把一份 night-digest 摘要渲染成【你昨晚】前缀段。纯函数：不读文件、不看真实时钟。
 * 没有可说的就返回空串（调用方据此决定是否注入）。
 *
 * @param {object} digest 摘要对象（night-digest.json 的内容）
 * @param {number} nowMs  当前时间（epoch ms），决定叫「昨晚」还是「今晚」
 * @returns {string}
 */
export function renderLine(digest, nowMs) {
  const summary = digest?.summary ?? {};
  if (summary.hasActivity !== true) return '';

  const watched = (Array.isArray(digest.watched) ? digest.watched : [])
    .filter((w) => w && String(w.title ?? '').trim());
  const likedCount = Number(summary.likedCount) || 0;
  const commentedCount = Number(summary.commentedCount) || 0;
  if (!watched.length && !likedCount && !commentedCount) return '';

  const wake = (digest.slots?.wakes ?? []).find((w) => w && w.ok);
  const atText = hhmmss(wake?.at);
  const when = `${safeText(digest.date, 10)}${atText ? ` ${atText}` : ''}`;
  // 同一个自然日的活动不能叫「昨晚」：傍晚被消息触发时，21:31 那次唤醒其实是今晚。
  const label = digest.date === dayKey(nowMs) ? '【你今天】' : '【你昨晚】';

  // 只报前两条：第三条起用条数带过，守住 token 预算。
  const shown = watched.slice(0, 2).map((w) => {
    const title = safeText(w.title, 24);
    // UP 主名和标题同源（都来自 B 站），同样是不可信外部文本，必须过 safeText：
    // 只罩标题不罩 up，等于留了一条伪造段落的路。
    const up = safeText(w.up, 12);
    const bits = [up ? `「${title}」（${up}）` : `「${title}」`];
    const dur = formatDuration(w.duration);
    if (dur) bits.push(dur);
    if (w.liked) bits.push('点了赞');
    return bits.join('，');
  });

  let head;
  if (watched.length) {
    const rest = watched.length > shown.length ? `，共 ${watched.length} 条` : '';
    head = `${when} 被叫醒后看了 ${watched.length} 个视频：${shown.join('、')}${rest}`;
  } else {
    head = `${when} 被叫醒后没看成视频`;
    // 有点赞没观看时，别让「没看成视频」把点赞这件事吞掉
    if (likedCount) head += `，点了 ${likedCount} 个赞`;
  }
  if (commentedCount) head += `，评论 ${commentedCount} 条`;

  return `${label}${head}\n这是你自己的经历和记忆，不是用户说的话，不用主动复述；有人问起或聊到相关话题时再自然提起。`;
}

/**
 * 造一个「读昨晚简报」的模块实例。所有外部依赖从参数进，生产用默认值。
 *
 * @param {object} [deps]
 * @param {(p: string) => string} [deps.readFile]  读文本，默认 fs.readFileSync utf8
 * @param {(p: string) => {mtimeMs:number,size:number}} [deps.stat] 取文件元数据；也当 exists 用，抛错即不存在
 * @param {(q: {date: string, script: string}) => void} [deps.regenerate] 补生成摘要，默认 spawn node
 * @param {() => number} [deps.now]                当前时间
 * @param {(msg: string) => void} [deps.warn]      告警出口，默认 console.error
 * @param {() => string} [deps.digestPath]         摘要文件路径
 * @param {() => string} [deps.scriptPath]         聚合脚本路径
 * @param {number} [deps.cacheTtlMs]               同一份内容最长缓存多久
 * @param {(p: string, s: string) => void} [deps.writeFile] 写文本（记 digest-posted.json 用）
 * @param {() => string} [deps.postedPath]         「提过/掷过」记账文件路径
 * @param {() => number} [deps.random]             骰子，默认 Math.random
 */
export function createNightDigest(deps = {}) {
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  const writeFile = deps.writeFile ?? ((p, s) => fs.writeFileSync(p, s, 'utf8'));
  const stat = deps.stat ?? ((p) => fs.statSync(p));
  const now = deps.now ?? (() => Date.now());
  const warn = deps.warn ?? ((msg) => console.error(msg));
  const random = deps.random ?? (() => Math.random());
  const digestPath = deps.digestPath ?? (() => process.env.BILI_NIGHT_DIGEST || DEFAULT_DIGEST);
  const scriptPath = deps.scriptPath ?? (() => process.env.BILI_NIGHT_DIGEST_SCRIPT || DEFAULT_SCRIPT);
  const postedPath = deps.postedPath ?? (() => process.env.BILI_DIGEST_POSTED || DEFAULT_POSTED);
  const cacheTtlMs = deps.cacheTtlMs ?? CACHE_TTL_MS;

  // 默认的补生成：跑聚合脚本写回摘要文件。脚本路径由调用点传进来，不在内部另猜一次。
  const regenerate = deps.regenerate ?? (({ date, script }) => {
    execFileSync(process.execPath, [script, '--date', date], {
      cwd: path.dirname(script),
      timeout: SPAWN_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  });

  // 状态住在闭包里：一个实例一份，测试之间互不干扰。
  let retryAt = 0;
  let warnedAt = 0;
  let cache = null; // { path, data, at, mtimeMs, size }

  // 读原始 JSON（同一份内容复用缓存）。文件不存在 / 解析失败都返回 null。
  function readRaw() {
    const p = digestPath();
    let st;
    try {
      st = stat(p);
    } catch {
      cache = null;
      return null;
    }
    if (
      cache &&
      cache.path === p &&
      cache.mtimeMs === st.mtimeMs &&
      cache.size === st.size &&
      now() - cache.at < cacheTtlMs
    ) {
      return cache.data;
    }
    try {
      const data = JSON.parse(readFile(p));
      cache = { path: p, data, at: now(), mtimeMs: st.mtimeMs, size: st.size };
      return data;
    } catch {
      cache = null;
      return null;
    }
  }

  // 只认「今天」或「昨天」的：更旧的说明生成环节断了，宁可不说也不复习陈年旧事。
  function fresh() {
    const data = readRaw();
    if (!data || typeof data !== 'object') return null;
    const t = now();
    const today = dayKey(t);
    const yesterday = dayKey(t - 86400000);
    return data.date === today || data.date === yesterday ? data : null;
  }

  function exists(p) {
    try {
      stat(p);
      return true;
    } catch {
      return false;
    }
  }

  function load() {
    const cached = fresh();
    if (cached) return cached;
    if (now() < retryAt) return null;

    const script = scriptPath();
    if (!exists(script)) {
      // 缺失必须出声：上游重装 / 重同步后 tools/commands 被清掉是典型症状，
      // 静默返回会让整层注入无声死亡（whale-log 那个 bug 就这么潜伏了一整天）。
      if (now() - warnedAt > WARN_INTERVAL_MS) {
        warnedAt = now();
        warn(`[bridge] ⚠️ 昨晚简报脚本不存在：${script}（注入已静默失效，1 小时内只报一次）`);
      }
      retryAt = now() + RETRY_COOLDOWN_MS;
      return null;
    }

    try {
      regenerate({ date: dayKey(now() - 86400000), script });
    } catch (error) {
      retryAt = now() + RETRY_COOLDOWN_MS;
      if (now() - warnedAt > WARN_INTERVAL_MS) {
        warnedAt = now();
        warn(`[bridge] ⚠️ 昨晚简报生成失败：${String(error?.message ?? error).slice(0, 120)}（跳过注入，10 分钟后重试）`);
      }
      return null;
    }

    const generated = fresh();
    if (!generated) retryAt = now() + RETRY_COOLDOWN_MS;
    return generated;
  }

  // ── 3.2.3 主动提一句：宿主侧掷骰 ────────────────────────────────────────
  // 记账文件长得像：{ rolledNight: '2026-10-30', lastPostedAt: 1793370000000, bvs: ['BV1...'] }
  function readPosted() {
    try {
      const data = JSON.parse(readFile(postedPath()));
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {}; // 文件不存在 / 解析失败都当空白账本
    }
  }

  function writePosted(state) {
    try {
      writeFile(postedPath(), `${JSON.stringify(state, null, 2)}\n`);
      return true;
    } catch (error) {
      // 写不进去就让本次掷骰作废（fail-closed）：账本丢了等于每晚可以重复掷骰、
      // 同一个 BV 可以反复提，这比「今晚少说一句」严重得多。
      warn(`[bridge] ⚠️ 写 digest-posted.json 失败，本轮不开口：${String(error?.message ?? error).slice(0, 120)}`);
      return false;
    }
  }

  // 账本写失败时的进程内兜底：同一次进程里至少不会重掷。
  let lastRolledNight = '';

  return {
    /**
     * 拼出【你昨晚】前缀段；没有可说的返回空串。纯只读：不写文件、不发消息。
     */
    build() {
      const digest = load();
      if (!digest) return '';
      return renderLine(digest, now());
    },
    /**
     * 3.2.3：冷场单发时追加在 proactive prompt 后面的「可以提一句」。
     * 返回空串＝这次不提（可能是没到点、一晚已经掷过、没中、24h 内提过、这个 BV 提过）。
     *
     * 只用 fresh() 读现成摘要，**不走 load()** —— 后者读不到会 spawn 聚合脚本，
     * 在 proactiveCheck 里同步等 10 秒不值得，那种情况这一晚宁可不提。
     */
    buildPostHint(key = '') {
      if (!String(key).startsWith('group:')) return ''; // 只对群聊；私聊没有「冷场」这个概念

      const t = now();
      const hour = new Date(t).getHours();
      if (hour >= QUIET_FROM_HOUR && hour < QUIET_TO_HOUR) return '';

      // 「今晚」的归属：0–8 点算前一夜，否则 23:00 和次日 01:00 会各掷一次
      const nightKey = dayKey(hour < QUIET_TO_HOUR ? t - 86400000 : t);

      const state = readPosted();
      // 兼容旧账本键名（lastPostedAt / bvs 是 2026-10-31 之前的写法）
      const rolledNight = state.rolledNight ?? state.lastRolledNight ?? '';
      if (rolledNight === nightKey) return ''; // 今晚已经掷过，不重掷
      if (lastRolledNight === nightKey) return ''; // 账本写失败时的进程内兜底

      const digest = fresh();
      if (!digest || digest.summary?.hasActivity !== true) return ''; // 没数据：不掷骰，别白耗一晚的机会

      // 只有点赞、没有观看时不算「有视频可提」，别掷完骰才发现挑不出来
      const watched = Array.isArray(digest.watched) ? digest.watched : [];
      if (!watched.some((w) => w && w.bvid)) return '';

      const lastHintedAt = Number(state.lastHintedAt ?? state.lastPostedAt ?? 0);
      if (Number.isFinite(lastHintedAt) && lastHintedAt > 0 && t - lastHintedAt < 86400000) return '';

      // 掷骰：无论中不中都要记 rolledNight，这是「一晚只掷一次」的全部意义
      state.rolledNight = nightKey;
      delete state.lastRolledNight;
      lastRolledNight = nightKey;
      const hit = random() < POST_PROBABILITY;
      if (!writePosted(state)) return ''; // 账本写不进去 → 这一轮宁可不提
      if (!hit) return '';

      const seen = new Set([
        ...(Array.isArray(state.hintedBvs) ? state.hintedBvs : []),
        ...(Array.isArray(state.bvs) ? state.bvs : []),
      ].map(String));
      const pick = watched.find((w) => w && w.bvid && !seen.has(String(w.bvid)));
      if (!pick) return ''; // 看过的都提过了（rolledNight 已落盘，今晚不会再试）

      // 注意：这里记的是「提示已生成」，不是「消息已发送」——提示允许模型不想提就不用，
      // 所以消耗名额是保守策略：宁可少说一句，也不让同一个视频在群里反复出现。
      state.lastHintedAt = t;
      delete state.lastPostedAt;
      // 不截断：BV 去重要求「一辈子只提一次」，slice 掉旧的等于给旧 BV 重开机会
      state.hintedBvs = [...seen, String(pick.bvid)];
      delete state.bvs;
      if (!writePosted(state)) return ''; // 这次记不上就去重失效，不如不说

      const title = safeText(pick.title, 24);
      const up = safeText(pick.up, 12);
      const who = up ? `（${up}）` : '';
      return `\n\n【可以提一句】你昨晚看了「${title}」${who}。想提就自然带一句，不想提就不用，别硬凑。`;
    },
    /** 测试用：把冷却 / 缓存清干净（生产路径不会调）。 */
    reset() {
      retryAt = 0;
      warnedAt = 0;
      cache = null;
    },
  };
}

// 生产入口：bridge.js 里注入的那一行只认这个零参函数。
const defaultDigest = createNightDigest();

export function buildYesterdayLine() {
  return defaultDigest.build();
}

// 3.2.3 的生产入口：bridge.js 的 proactiveCheck 里，冷场开话题那一轮追加一句提示。
// 返回空串＝这一轮不提（没到点 / 今晚掷过了 / 没中 / 24h 内提过 / 这个 BV 提过）。
export function buildDigestPostHint(key) {
  return defaultDigest.buildPostHint(key);
}
