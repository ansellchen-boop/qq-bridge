// qq_set_wake_config 的参数归一（上游 issue #70）。
//
// 原行为：triggers 里传 `at` / `name` / `keyword` 会被 zod 静默丢弃，
// 接口照样返回 ok:true，agent 以为开上了其实没开；`mode:"silent"` 直接 enum 报错；
// `keywords` 传字符串（"大肥鱼,本鲸"）会在桥接侧走 `: []` 分支，把原有全部关键词清空。
//
// 这里把常见说法折叠成规范名，并把「不认识、已忽略」的字段名交回去，
// 让 agent 下一步知道该写什么，而不是继续猜。

const CONFIG_KEYS = new Set(['mode', 'infinite', 'sleepMs', 'sleepUntil', 'triggers', 'batchWindowMs']);

const TRIGGER_ALIASES = {
  atmention: 'atMention', at: 'atMention', mention: 'atMention', atmentionme: 'atMention',
  namemention: 'nameMention', name: 'nameMention', nickname: 'nameMention',
  keyword: 'keywords', keywords: 'keywords', kw: 'keywords', kws: 'keywords',
  question: 'question', ask: 'question', directed: 'question',
  poke: 'poke', pat: 'poke', nudge: 'poke',
  anymessage: 'anyMessage', any: 'anyMessage', all: 'anyMessage',
  probability: 'probability', prob: 'probability', chance: 'probability',
  speakerids: 'speakerIds', speakers: 'speakerIds', users: 'speakerIds',
};

const MODE_ALIASES = {
  diving: 'diving', dive: 'diving', silent: 'diving', quiet: 'diving', sleep: 'diving',
  sleeping: 'diving', rest: 'diving', idle: 'diving', off: 'diving', 潜水: 'diving', 安静: 'diving',
  active: 'active', awake: 'active', normal: 'active', on: 'active', 活跃: 'active', 正常: 'active',
};

export const TRIGGER_KEY_LIST = 'atMention/nameMention/keywords/question/poke/anyMessage/probability/speakerIds';

/** 把 keywords 的字符串写法按分隔符拆成数组；拆不出内容时返回空数组（调用方负责回退）。 */
export function splitKeywordString(raw) {
  return String(raw ?? '')
    .split(/[,，、/\s]+/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((k) => k.slice(0, 100));
}

/**
 * 归一 qq_set_wake_config 的 config 参数。
 * @param {unknown} input
 * @returns {{config: object, notes: string[], ignoredKeys: string[]}}
 */
export function normalizeWakeConfig(input) {
  const notes = [];
  const ignoredKeys = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { config: {}, notes, ignoredKeys };

  const out = {};
  // 顶层
  for (const [rawKey, value] of Object.entries(input)) {
    if (rawKey === 'triggers') continue;
    const key = rawKey.trim();
    if (!CONFIG_KEYS.has(key)) { ignoredKeys.push(rawKey); continue; }
    if (key === 'mode') {
      const folded = MODE_ALIASES[String(value ?? '').trim().toLowerCase()];
      if (folded) {
        out.mode = folded;
        if (folded !== String(value).trim()) notes.push(`mode "${value}" 已按 ${folded} 处理`);
      } else {
        ignoredKeys.push(`mode=${value}`);
      }
      continue;
    }
    out[key] = value;
  }
  // triggers
  const tr = input.triggers;
  if (tr && typeof tr === 'object' && !Array.isArray(tr)) {
    const triggers = {};
    const unknown = [];
    for (const [rawKey, value] of Object.entries(tr)) {
      const key = TRIGGER_ALIASES[String(rawKey).trim().toLowerCase()];
      if (!key) { unknown.push(rawKey); continue; }
      if (key === 'keywords') {
        const list = Array.isArray(value) ? value.map((k) => String(k ?? '').trim()).filter(Boolean) : splitKeywordString(value);
        triggers.keywords = list.slice(0, 50).map((k) => k.slice(0, 100));
        continue;
      }
      if (key === 'speakerIds') {
        const list = Array.isArray(value) ? value : splitKeywordString(value);
        triggers.speakerIds = list.slice(0, 20);
        continue;
      }
      if (key === 'probability') {
        const n = Number(value);
        if (Number.isFinite(n)) triggers.probability = Math.max(0, Math.min(1, n));
        else unknown.push(`${rawKey}=${value}`);
        continue;
      }
      // 布尔类
      if (typeof value === 'boolean') triggers[key] = value;
      else if (value === 'true' || value === 'false') triggers[key] = value === 'true';
      else unknown.push(`${rawKey}=${value}`);
    }
    if (Object.keys(triggers).length) out.triggers = triggers;
    if (unknown.length) {
      ignoredKeys.push(...unknown);
      notes.push(`triggers 里这些字段不认识，已忽略：${unknown.join(', ')}（可用：${TRIGGER_KEY_LIST}）`);
    }
  }
  if (ignoredKeys.length && !notes.length) {
    notes.push(`这些字段不认识，已忽略：${ignoredKeys.join(', ')}`);
  }
  return { config: out, notes, ignoredKeys };
}
