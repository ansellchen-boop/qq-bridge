import fs from 'node:fs';
import crypto from 'node:crypto';

const TS = process.env.TS || 'bak';
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
let problems = 0;

function patch(file, edits, backupTag) {
  let t = fs.readFileSync(file, 'utf8');
  const before = t;
  for (const [oldStr, newStr, label] of edits) {
    const hits = t.split(oldStr).length - 1;
    if (hits !== 1) {
      console.error(`[FAIL] ${file} :: ${label} → 命中 ${hits} 次（要求恰好 1）`);
      problems++;
      continue;
    }
    t = t.replace(oldStr, newStr);
    console.log(`[ok] ${file} :: ${label}`);
  }
  if (t === before) { console.log(`[skip] ${file} 無變更`); return; }
  const bak = `${file}.bak-${backupTag}-${TS}`;
  fs.copyFileSync(file, bak);
  fs.writeFileSync(file, t, 'utf8');
  console.log(`${file}`);
  console.log(`  backup: ${bak}`);
  console.log(`  md5: ${md5(before)} → ${md5(t)}   chars ${before.length} → ${t.length}`);
}

/* ---------- 1) qq-model-view.js：每條消息附上人類可讀的 ageText ---------- */
const view = '/root/qq-bridge/src/qq-model-view.js';
const viewOldAnchor = `  if (Array.isArray(result.media)) {
    const canResolveByMessage = Number.isSafeInteger(message.seq) && message.seq > 0;
    result.media = compactMedia(result.media, canResolveByMessage);
  }
  return result;
}`;
const viewNewAnchor = `  if (Array.isArray(result.media)) {
    const canResolveByMessage = Number.isSafeInteger(message.seq) && message.seq > 0;
    result.media = compactMedia(result.media, canResolveByMessage);
  }
  // 相對時間：讓模型不必自己減毫秒時間戳。喚醒提示要求「回得晚就引用」，
  // 判斷依據就是這個 ageText（超过 4 分钟＝回得晚）。
  if (Number.isFinite(result.time)) {
    const age = relativeAgeText(result.time);
    if (age) result.ageText = age;
  }
  return result;
}

function relativeAgeText(ms) {
  const diff = Date.now() - ms;
  if (diff < 60000) return '刚刚';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return \`\${minutes}分钟前\`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return \`\${hours}小时前\`;
  return \`\${Math.floor(hours / 24)}天前\`;
}`;

patch(view, [[viewOldAnchor, viewNewAnchor, 'ageText 相對時間']], 'quote4min');

/* ---------- 2) bridge.js：喚醒提示的引用規則加入「超過 4 分鐘也必須引用」 ---------- */
const bridge = '/root/qq-bridge/src/bridge.js';
const ruleOld = '（快照或读消息里那条的 seq / messageId 都能填）；只隔 1~4 条就别引用，别动辄挂着引用。';
const ruleNew = '（快照或读消息里那条的 seq / messageId 都能填）；只隔 1~4 条就别引用，别动辄挂着引用。**另一种必须引用的情况是回得晚**：你要回的那条消息如果距离现在已经超过 4 分钟（看快照里那条的 ageText：「6分钟前」「1小时前」这种就是回得晚，不用自己换算时间戳），即使只隔一两条也必须引用，回得越晚越要引用——隔了这么久对方早换话题了，不引用会显得你反应慢半拍还不知道在回谁。';

patch(bridge, [[ruleOld, ruleNew, '引用規則加入 4 分鐘條件']], 'quote4min');

process.exit(problems ? 1 : 0);
