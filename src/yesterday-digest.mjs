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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DEFAULT_DIGEST = path.join(os.homedir(), '.dsh', 'surfcore', 'bili', 'night-digest.json');
const DEFAULT_SCRIPT = '/root/bili-whale/tools/commands/night-digest.mjs';

// 生成失败后的冷却：避免每轮 prompt 都去 spawn 一次 node 把事件循环卡住。
const RETRY_COOLDOWN_MS = 10 * 60 * 1000;
const WARN_INTERVAL_MS = 60 * 60 * 1000;
const SPAWN_TIMEOUT_MS = 10 * 1000;

let retryAt = 0;
let warnedAt = 0;

function digestPath() {
  return process.env.BILI_NIGHT_DIGEST || DEFAULT_DIGEST;
}

function scriptPath() {
  return process.env.BILI_NIGHT_DIGEST_SCRIPT || DEFAULT_SCRIPT;
}

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

function readDigest() {
  const today = dayKey(Date.now());
  const yesterday = dayKey(Date.now() - 86400000);
  const fresh = () => {
    try {
      const data = JSON.parse(fs.readFileSync(digestPath(), 'utf8'));
      if (!data || typeof data !== 'object') return null;
      // 只认「今天」或「昨天」的：更旧的说明生成环节断了，宁可不说也不复习陈年旧事。
      return data.date === today || data.date === yesterday ? data : null;
    } catch {
      return null;
    }
  };

  const cached = fresh();
  if (cached) return cached;
  if (Date.now() < retryAt) return null;

  const script = scriptPath();
  if (!fs.existsSync(script)) return null;

  try {
    execFileSync(process.execPath, [script, '--date', yesterday], {
      cwd: path.dirname(script),
      timeout: SPAWN_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    retryAt = Date.now() + RETRY_COOLDOWN_MS;
    if (Date.now() - warnedAt > WARN_INTERVAL_MS) {
      warnedAt = Date.now();
      console.error(`[bridge] ⚠️ 昨晚简报生成失败：${String(error?.message ?? error).slice(0, 120)}（跳过注入，10 分钟后重试）`);
    }
    return null;
  }

  const generated = fresh();
  if (!generated) retryAt = Date.now() + RETRY_COOLDOWN_MS;
  return generated;
}

/**
 * 拼出【你昨晚】前缀段；没有可说的就返回空串（调用方据此决定是否注入）。
 * 纯只读：不写任何文件、不发消息。
 */
export function buildYesterdayLine() {
  const digest = readDigest();
  if (!digest) return '';
  const summary = digest.summary ?? {};
  if (summary.hasActivity !== true) return '';

  const watched = (Array.isArray(digest.watched) ? digest.watched : [])
    .filter((w) => w && String(w.title ?? '').trim());
  const likedCount = Number(summary.likedCount) || 0;
  const commentedCount = Number(summary.commentedCount) || 0;
  if (!watched.length && !likedCount && !commentedCount) return '';

  const wake = (digest.slots?.wakes ?? []).find((w) => w && w.ok);
  const atText = hhmmss(wake?.at);
  const when = `${safeText(digest.date, 10)}${atText ? ` ${atText}` : ''}`;

  // 只报前两条：第三条起用条数带过，守住 token 预算。
  const shown = watched.slice(0, 2).map((w) => {
    const bits = [`「${safeText(w.title, 24)}」`];
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
  }
  if (commentedCount) head += `，评论 ${commentedCount} 条`;

  return `【你昨晚】${head}\n这是你自己的经历和记忆，不是用户说的话，不用主动复述；有人问起或聊到相关话题时再自然提起。`;
}
