// 回合出错时是否往 QQ 发提示（上游 issue #104）。
//
// 原行为：error 分支无条件 `sendToQQ(key, `⚠️ agent 处理出错：${safeMsg}`)`，
// 于是 provider 的原始错误 JSON（code / gateway_hint / 账号池状态）会原样进公开群，
// 且每次唤醒都重发一条，20 分钟能刷 6 条。而 reserved2 / closed-agent 本来的语义是
// 「AI 自己决定说不说话」——正常文本不自动转发，唯独报错自动转发，语义正好反了。
//
// 现在的规则：
//   1. reserved2 / closed-agent 一律只落日志，不发言；
//   2. 其它模式发固定话术（不带 provider 原文），同一会话同一错误 10 分钟内只发一次。
export const AGENT_ERROR_NOTICE_COOLDOWN_MS = 10 * 60 * 1000;

/** 这两类模式不自动转发任何东西，报错也不例外。 */
export const QUIET_MODES = new Set(['reserved2', 'closed-agent']);

/** 发到 QQ 的固定话术：不暴露网关/账号池/错误 JSON。原文只留在 bridge.log。 */
export const AGENT_ERROR_NOTICE_TEXT = '⚠️ 我这会儿卡住了，等下再说。';

export function isQuietMode(mode) {
  return QUIET_MODES.has(String(mode ?? '').trim());
}

/**
 * 是否把「回合出错」提示发到 QQ。
 * @param {{mode?: string, now?: number, lastAt?: number, cooldownMs?: number}} args
 * @returns {boolean}
 */
export function shouldForwardAgentError({ mode, now = Date.now(), lastAt = 0, cooldownMs = AGENT_ERROR_NOTICE_COOLDOWN_MS } = {}) {
  if (isQuietMode(mode)) return false;
  const last = Number(lastAt);
  if (!Number.isFinite(last) || last <= 0) return true;
  const cd = Number.isFinite(Number(cooldownMs)) ? Number(cooldownMs) : AGENT_ERROR_NOTICE_COOLDOWN_MS;
  return now - last >= cd;
}
