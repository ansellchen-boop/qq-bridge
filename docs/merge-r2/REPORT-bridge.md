# REPORT-bridge.md —— `src/bridge.js` 35 个冲突块收尾

分支 `upgrade/r2`，merge `v0.2.1-r2`（b77e4a2，MERGE_HEAD）进行中；HEAD `c1e9e57`。
本单只动 `src/bridge.js`，另加 `MERGE-PROGRESS.md` / `REPORT-bridge.md` 两个说明文件。

行号一律是**解完后的 `src/bridge.js` 行号**（`块号` 是解前的 1–35 编号）。

---

## 1. 逐块决策表

| 块 | 行号 | 函数 / 位置 | 决策 | 理由 | 风险 |
|---|---|---|---|---|---|
| 1 | 2170 | `sendStickerV2` | 上游 | 带 `{ allowPorts: MEDIA_FETCH_ALLOW_PORTS }`；端口白名单是 opt-in，不传就等于不限端口 | 低 |
| 2 | 2695 | 常量区（`RESTORED_TURN_GRACE_MS`） | 上游 | 恢复出来的回合只保留 45s 宽限，治「重启后忙 15 分钟」（#93）；HEAD 侧是空块 | 低 |
| 3 | 3099 | `rebuildInFlightCollector` | 融合 | 保留我方 `v2SessionActivityAt.set(sessionId, Date.now())`，叠加上游「起点前移」写法 | 低 |
| 4 | 4056 | `startConsoleServer`（只读降级 err） | 上游 | `{ safeError: true }` 阻止错误串被当普通文本回显 | 低 |
| 5 | 5399 | `startConsoleServer`（sticker 上下文） | 融合 | `promptMaxStickers ?? 20, key`：保留我方默认 20 + 上游会话隔离 | 低 |
| 6 | 5532 | `startConsoleServer`（keywords 归一） | 融合 | 保留 `splitKeywordString`（`./wake-config-alias.js`，import 在 :26），同时接受上游的 trim/filter/长度截断净化 | 中：字符串写法依赖上游 schema 放行（测试 #70 已覆盖并通过） |
| 7 | 6079 | `startConsoleServer`（sendGuard） | 上游（删我方那行） | 上游把 `captureSendGuard(key, { ai: true })` 提前到 :6079，HEAD 那行 `captureSendGuard(key)` 留着会同作用域重复声明 → SyntaxError | 低 |
| 8 | 6777 | `startConsoleServer`（wait 租约 429） | 上游 | `retryAfterMs` + `hint`：治「模型反复重试空转」（2026-10-07 事故） | 低 |
| 9 | 8434 | 常量区（`MEDIA_FETCH_ALLOW_PORTS`） | 上游 | 定义块，HEAD 侧为空；不取则 5 处引用全 ReferenceError | 低 |
| 10 | 8559 | `fetchOneBotImage` → `tryUrls` | 上游 | allowPorts | 低 |
| 11 | 8588 | `fetchOneBotImage` → `tryGetImage` | 上游 | allowPorts | 低 |
| 12 | 8631 | `fetchFaceMedia` | 上游 | allowPorts | 低 |
| 13 | 9787 | `formatMemoryV2`（话题陈旧阈值） | 我方 | 24h 判「已搁置」；上游=base 的 2h，我方是刻意调优 | 低 |
| 14 | 9805 | `formatMemoryV2`（印象 traits） | 我方 | `traitText` 逐条补「；」、按句读分隔，可读性优于 `join('、')` | 低 |
| 15 | 10885 | `appendSocialV2Message` | 上游 | `messageId` 幂等去重（`seenMessageIds` / `MAX_SEEN_MESSAGE_IDS` 有界 LRU）；我方 media 归一化注释在非冲突区，未受影响 | 低 |
| 16 | 11301 | `buildTimeSenseLine` | 我方 | sender 过 `sanitizeUntrustedText`（上游裸拼） | 低 |
| 17 | 11404 | `buildWakePromptV2`（roleLine） | 上游 | `roleForWake` 按 `injectEveryNWakes` 注入节奏；换卡/首次全量 | 低 |
| 18 | 11427 | `buildWakePromptV2`（stickerLine） | 融合 | `?? 20` + `key` | 低 |
| 19 | 11465 | `buildWakePromptV2`（base 拼接） | 融合 | 用上游顺序，但补回我方 `longTermMemoryLine` / `webToolLine`（否则跨会话记忆与 `web_search` 主路径消失） | 中：提示词前缀变化 ⇒ 部署首轮 cacheMiss |
| 20 | 11470 | `buildWakePromptV2`（triggeredLine） | 我方 | sender 过 sanitize | 低 |
| 21 | 11486 / 11489–11495 | `buildWakePromptV2` 尾部 + `buildWakeReminderPromptV2` 头（同块） | 融合 | 主 prompt 保留我方「引用/点名」长规则与主动机会里的 `web_search`；reminder 取上游（只给一行「继续按角色卡说话」，同回合不重复整卡） | 中：跨函数边界的块，须分侧取，整块 one-side 会丢功能或重复整卡 |
| 22 | 11551 | `sendWakePromptV2`（限频重试） | 上游 | `!isDirectedWakeReason(reason)`：点名类即使未读被清也要补发（#109） | 低 |
| 23 | 11670 | `releaseStuckBusyV2` | 我方 | 上游完全没有这个函数，而 `busyReasonV2` / `isConversationBusyV2` 在调它；丢了就是忙标记永不复位（issue #19 回归） | 中：与上游 45s 宽限并存，两者顺序是「先宽限、再租约」，无冲突 |
| 24 | 11689 | `busyReasonV2` 之后 | 上游（空行） | 纯空白差异 | 无 |
| 25 | 11702 | `isConversationBusyV2` | 我方 | 上游那句 `const sid = state.sessions[key];` 与函数顶部已有声明重复 → SyntaxError | 低 |
| 26 | 11752 | `isDirectedWakeReason` 定义 | 上游 | 新函数，块 22/29 依赖 | 低 |
| 27 | 11810 | `replayPendingWakeReasonsV2` 注释 | 上游 | 注释已改成「点名类必须补发」，与新逻辑一致 | 无 |
| 28 | 11820 | `replayPendingWakeReasonsV2`（坏条目） | 上游 | 跳过坏条目后继续补发，不再提前收尾 | 低 |
| 29 | 11838 | `replayPendingWakeReasonsV2`（补发判定） | 上游 | `stillRelevant \|\| directed` | 低 |
| 30 | 11845 | `replayPendingWakeReasonsV2`（跳过分支） | 上游 | 跳过一条后继续递归 | 低 |
| 31 | 12188 | `handleIncoming`（模型侧正文） | 上游 | `${modelContent}`：:12183 处已按 `closed-agent && isOwner` 做过豁免+sanitize，比我方裸 `sanitizeUntrustedText(textContent)` 更准确 | 低 |
| 32 | 12532 | `trackTurnEvent` | 上游 | 交付游标：live `turn/start` 记 `markTurnStarted` | 低 |
| 33 | 12542 | `trackTurnEvent`（ended 分支） | 上游 | live `turn/end` 记 `markTurnDelivered`，必须在各 `continue` 之前 | 低 |
| 34 | 12889 | `pumpMux`（`ended.reason.kind === 'error'`） | 上游 | `reportTurnFailure(key, 'error', error)`：日志+活动记录+5 分钟去重+固定话术，`scripts/test-issue-followup-bridge.mjs:121` 与 `scripts/test-delivery-regressions.mjs:128` 都断言上游话术 `⚠️ 暂时无法处理消息，请稍后再试。` | 中：我方 `src/agent-error-notice.js` 的装配变成死代码（见 §3/§5） |
| 35 | 12900 | `pumpMux`（`aborted`） | 上游 | 同上；`reportTurnFailure` 对 aborted 仍发 `⏹️ 已停止`（`:8923`），我方行为未丢 | 同上 |

补充核对（任务单 A/B/D 三条）：

- A：`MEDIA_FETCH_ALLOW_PORTS` 解后 6 处 = `:2170`（sendStickerV2）、`:6168`（控制台媒体抓取，非冲突区未动）、`:8434`（定义）、`:8559`、`:8588`、`:8631`。
- B：取图顺序在 `fetchOneBotImage`（任务单写的 `:2170`/`sendStickerV2` 实为直接下载单 URL，没有 tryUrls/tryGetImage 对）：`src/bridge.js:8610-8612`
  `? (await tryUrls()) ?? (await tryGetImage())` / `: (await tryGetImage()) ?? (await tryUrls());`——表情 CDN 优先、普通图 `get_image` 优先，未解反。
- D：`appendSocialV2Message` 的 `kind/emojiId/summary/subType` 落在非冲突区（`src/bridge.js:10896` 起的「存储层归一化不能只留 kind/file/url/faceId」注释段），解冲突时未触碰；`R16` 用例 PASS。
- 另外任务单说「上游把 `buildWakePromptV2` 改过名」——核对结果：解后全文只有 `buildWakePromptV2`（`:11400`，调用点 `:10131`、`:11587`）与 `buildWakeReminderPromptV2`（`:11489`，调用点 `:12742`），没有残留旧名。

---

## 2. 被丢弃的上游内容

**无。**

检查依据：35 块逐块把 MERGE_HEAD 侧内容抄出来对照最终文件，除下面两处属「我方主动不保留」外，上游 r2 的新增能力全部在位——
1. 块 24 上游侧只有一个空行（我方保留了自己的换行）；
2. 块 21 上游主 prompt 的 return 文案被我方更长的「引用/点名 + 回得晚」版本取代，但上游同块新增的 `buildWakeReminderPromptV2`（一行提醒、不重复整卡）已保留。

上游新增能力抽查在位：`RESTORED_TURN_GRACE_MS`（:2695）、`safeError`（:4056）、`retryAfterMs/hint`（:6777）、`MEDIA_FETCH_ALLOW_PORTS` + 4 个调用点、`roleForWake` 节奏（:11404）、幂等入库（:10885）、`isDirectedWakeReason`（:11752，三处使用）、交付游标 `markTurnStarted`/`markTurnDelivered`（:12532/:12542）、`reportTurnFailure`（:12889/:12900）、`pendingWakeReasons` 递归补发（:11820/:11845）。

---

## 3. 被丢弃的「我们的」内容

两处，都是被上游等价实现取代，行为无退化：

1. **`pumpMux` 里的 `agent-error-notice` 装配（块 34/35）**。我方原逻辑：`shouldForwardAgentError(...)` + `agentErrorNoticeAt` 10 分钟冷却 + 固定话术 `⚠️ 我这会儿卡住了，等下再说。`；上游 `reportTurnFailure`（`src/bridge.js:8912-8926`）做同样的事：`log` + `appendActivity` + 5 分钟冷却 + `{ ai: true }` 发送固定话术。**三处差别**：冷却 10 分钟 → 5 分钟；话术换成上游那句（上游用例 `test-issue-followup-bridge.mjs:121` 断言的就是这句，硬改会红）；静默范围从「`reserved2` / `closed-agent` 都静默」收窄为「只有 `reserved2`（以及 `shouldBlockSilentReply`，即 silent 角色非主人私聊）静默」——**`closed-agent` 现在会收到那条固定提示**，这是上游 #104 的语义，不是我解错的。因此：
   - `src/bridge.js:25` 的 `import { shouldForwardAgentError, isQuietMode, AGENT_ERROR_NOTICE_TEXT }` 与 `src/bridge.js:2704` 的 `agentErrorNoticeAt` 现在是**未使用代码**，我保留了它们并加了一行注释说明来龙去脉（删/留见 §5）。
   - `src/agent-error-notice.js` 文件本身没动。
2. **块 7 我方那行 `const sendGuard = captureSendGuard(key);`**：上游已在 `:6079` 用 `captureSendGuard(key, { ai: true })` 覆盖，同一作用域两个 `const sendGuard` 是 SyntaxError，故删除。

其余我方能力（`media-normalize`、`yesterday-digest` 工厂、`token-ledger`、`web-search` 主路径、`sticker` 情绪触发、bili / tts 接线、`wake-config-alias`、`releaseStuckBusyV2`、24h 搁置阈值、`traitText`、两处 sender sanitize、跨会话记忆与 `web_search` 提示行、「引用/点名」规则）全部保留。

---

## 4. `npm run test:audit` 结果原文

命令与末 40 行（完整日志存 `/tmp/audit.log`）：

```
$ cd /home/ubuntu/qq-bridge-upgrade && npm run test:audit > /tmp/audit.log 2>&1; echo "exit=$?"
exit=1
$ tail -40 /tmp/audit.log
ok 29 - setConversation requires a live actor and leaves state untouched on rejection
  ---
  duration_ms: 0.738014
  type: 'test'
  ...
# Subtest: setConversation returns actor, time, and before/after for a valid owner command
ok 30 - setConversation returns actor, time, and before/after for a valid owner command
  ---
  duration_ms: 1.741092
  type: 'test'
  ...
# Subtest: deleteConversation requires an actor and returns a structured audit event
ok 31 - deleteConversation requires an actor and returns a structured audit event
  ---
  duration_ms: 1.805232
  type: 'test'
  ...
# Subtest: deleting an absent override is visibly a no-op
ok 32 - deleting an absent override is visibly a no-op
  ---
  duration_ms: 0.331343
  type: 'test'
  ...
# Subtest: invalid audit clock cannot commit a policy change
ok 33 - invalid audit clock cannot commit a policy change
  ---
  duration_ms: 1.509059
  type: 'test'
  ...
1..33
# tests 33
# suites 0
# pass 33
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 56.34981

Audit suite: 56/57 scripts passed.
```

失败的一个脚本（与 `src/bridge.js` 无关，证据在下；原先另一处 `test-tool-restrict-guard.mjs` 的合并回归已由人工修复，见 §4 ②，现 4/4 PASS）：

**① `scripts/test-restart-instance.mjs` —— 4 项失败，上游 r2 自带的同样失败（非本单造成）**

```
Running test-restart-instance.mjs
PASS 识别 bridge.js 入口，不把参数中的同名文本当成入口
PASS bridge 进程必须是 node 且使用可证明归属的绝对入口
PASS 守护窗口只认 start.bat，归属校验时要求绝对路径
FAIL 锁 PID 验证通过 + 端口属于同一 PID → 停止守护进程树 — AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

'abort' !== 'stop'

    at file:///home/ubuntu/qq-bridge-upgrade/scripts/test-restart-instance.mjs:59:10
...
❌ 4 项失败
FAILED test-restart-instance.mjs: exit 1
```

对照办法：`git worktree add /tmp/wt-r2 MERGE_HEAD`（纯净上游 r2，不含任何合并结果）后直接跑同一脚本：

```
$ cd /tmp/wt-r2 && node scripts/test-restart-instance.mjs | tail -4
❌ 4 项失败
```

⇒ 上游自己的 `stop-bridge-instance.mjs` + 该用例在本机（Linux，无 `start.bat`/`netstat` 语义）就不通过，属上游环境假设问题。（worktree 已 `git worktree remove` 清理。）

**② `scripts/test-tool-restrict-guard.mjs` —— 1 项失败，是我们与上游对「restrict 失败分类」的既有分歧**

```
Running test-tool-restrict-guard.mjs
FAIL restrict 全失败时不静默：写诊断文件 + 3 秒后重试 — Error: ENOENT: no such file or directory, open '/home/ubuntu/.hermes/cache/scratch/qq-tool-restrict-m1XWND/diag-always-fail.log'
[qq-tool-restrict] ... 全局层 restrict：隐藏 0 个 / 本安装不存在 83 个 / 真失败 0 个
FAILED  tests=4 failures=1
FAILED test-tool-restrict-guard.mjs: exit 1
```

根因不在 `src/bridge.js`：`plugins/qq-agent-presets/qq-tool-restrict.mjs:425-448` 是我方 2026-10-26 的分级逻辑——`tools.restrict()` 报 `unknown global tool` 归为「本安装不存在」，只有其它错误才算「真失败」、才写诊断文件；上游新用例要求**所有**失败都计数并落盘。上游纯净版该脚本 4/4 PASS（同样在 `/tmp/wt-r2` 里跑过）。⇒ 归类为「上游新用例断言了我们没有（且刻意不做）的行为」，按任务单要求不动用例，见 §5。

其余全部绿，与本次改动强相关的几组原文：

```
Running test-issue-followup-bridge.mjs
PASS #104 failed or aborted reserved2 turns remain private; other modes get bounded fixed notices
PASS #109 read receipts cannot discard directed wake requests
PASS #109 a deferred directed wake survives read receipts during the rate-limit window
PASS #70 direct wake-config accepts keyword strings and rejects invalid or unknown inputs atomically
...
Running test-delivery-regressions.mjs
PASS #104 prompt 拒绝不外发原始错误：reserved2 保持私密，其他模式固定提示并节流
PASS live turn/end 已交付的回合不会在重连快照里重发（含工具已发送的回合）
PASS 空回复 / 中止回合只推进游标，不补发
...
Running test-media-search.mjs
PASS fetchOneBotImage 表情优先 CDN，普通图片优先 get_image
PASS fetchMediaData 标注表情/图片，并保留 summary 与 emojiId
...
PASS R16 appendSocialV2Message 保留 kind/emojiId/summary/subType
PASS R27 桥接为 QQ 会话预分配可解码的 sessionId，并迁移旧的 session-* 映射
```

验收 ①–④ 原文：

```
$ git diff --name-only --diff-filter=U          # ① 期望 0
（无输出）
$ grep -c '^<<<<<<<' src/bridge.js             # ② 期望 0
0
$ node --check src/bridge.js && echo 'OK bridge.js'   # ③
OK bridge.js
$ grep -c 'encodeSelfKey' src/bridge.js        # ④
3
$ grep -c 'BOUND_SESSION_ID_RE' src/bridge.js
2
$ grep -c 'MEDIA_FETCH_ALLOW_PORTS' src/bridge.js    # 期望 6
6
$ git diff --name-only --diff-filter=U | wc -l  # 收工自检
0
```

---

## 5. 需要人拍板的点

1. ~~**`version` 字段**~~ → **已定（用户 2026-11-02）**：升到 `0.2.1-r2.1`。实际改了 5 处：`package.json`、`package-lock.json`（顶层 + `packages[""]` 各一处）、`plugins/qq-agent-presets/package.json`、`plugins/qq-mode-console/package.json`。
2. **LICENSE**：HEAD（我方 r1）是 MIT，上游 r2 与合并后工作区都是 PolyForm Noncommercial 1.0.0（`git diff HEAD MERGE_HEAD -- LICENSE` 133+/151-），`package.json` 的 `license` 字段已同步为 `PolyForm-Noncommercial-1.0.0`。**法律口径要说清：含 r2 代码的合并结果，不能靠把 LICENSE 改回 MIT + 补一个 NOTICE 就重新声明成 MIT —— NOTICE 改变不了上游授权。** 不接受该协议的唯一合规做法是本版不合并，或先取得上游另行授权。→ **已定（用户 2026-11-02）：接受该协议，按上游保留 PolyForm。**
3. ~~**`scripts/test-tool-restrict-guard.mjs` 红**~~ → **已修（人工）**：在 `plugins/qq-agent-presets/qq-tool-restrict.mjs` 加了「全失败也写诊断」分支（`const allFailed = firstOk === 0 && 名单非空`，条件改 `firstBroken.length > 0 || allFailed`；延迟重试落盘条件同步补），没退回「每次启动 3KB 噪声」的老路，现 4/4 PASS。该文件与 `presets/qq-chat-v2.patch.yml` 仍未暂存，commit 前必须 `git add`。
4. ~~**`qq_set_wake_config` 别名兼容**~~ → **已定（用户 2026-11-02）：补回**。两处改动：`src/mcp-snowluma-safe.js` 的 `normalizeWakeArguments()` 把 `normal/正常/on/awake` 归回 `active`、`dive/sleeping/rest/idle/off` 归回 `diving`（原合并版把 `normal` 静默设成 `diving`），并在 triggers 的 zod `.strict()` schema 与 `foldArgumentAliases` 里补齐 14 个旧别名（`mention/atmentionme/nickname/kw/kws/ask/directed/pat/nudge/any/all/chance/speakers/users`）。实测：14/14 别名通过、冲突检测与未知字段仍报错、`test-issue-followup-mcp` 14/14、`test-tool-restrict-guard` 4/4。
5. **`scripts/test-restart-instance.mjs` 红**（§4 ①）：上游纯净版同样红（Linux 环境假设），建议单独开单修上游脚本，别在本 merge 里塞。
6. **`src/agent-error-notice.js` 去留**：桥接已改走上游 `reportTurnFailure`，`:25` 的 import 与 `:2704` 的 `agentErrorNoticeAt` 成了死代码（我保留了并加注释）。建议后续单开一单删掉这个装配与模块，或反过来把上游函数改成读我们的常量（但会与两条上游用例的断言文案冲突，不建议）。
7. **`plugins/qq-agent-presets/presets/qq-chat-v2.patch.yml`** 由 `scripts/build-agent-preset-patches.mjs` 生成：本合并中曾被手工对齐、漏掉三句 prompt 措辞，已用生成器重算并 `diff -q` 确认 IDENTICAL。以后改 `dsh/agent-presets/qq-chat-v2/agent.cordis.yml` 必须重跑该生成器。
8. **`test-installed-preset-sync.mjs`**：合并后 **PASS**（`Running test-installed-preset-sync.mjs / PASS installed preset resolution, bundle rendering, legacy fallback, idempotence and bridge wiring`），不需要处理；上一单把它列为待拍板，这里给结论。
9. **提示词前缀变化**（信息项，不需动作）：块 19/21 让 `buildWakePromptV2` 的 prompt 文本与 HEAD 不同，上线首轮 ACP 前缀缓存会 miss 一次（几万 token 量级），之后恢复。

---

## 6. 上线前的真机验收清单建议

按「升级后第一轮就能看出问题」排序：

1. **会话 id 重建**：`grep 'session/create' bridge.log` 看新会话 id 是否为 `qqb-g-<群号>-<32hex>`；旧 `session-*` 映射应被迁移并 `archived`（`R27` 覆盖的是逻辑，真机看日志）。若出现 `会话绑定校验未通过`，说明 `encodeSelfKey`/`boundSessionId` 链路没接上（本单确认 `:1494/:1497/:9054/:9107` 未动）。
2. **QQ 工具能不能用**：群里 @ 一次，确认模型能调 `qq_send_message`（注意 `qq-tool-restrict` 的 restrict 名单在真机上会隐藏 83 个工具，`restrict 真失败 N` 应为 0）。
3. **表情**：让模型发一张收藏表情 + 一张 CDN 表情，确认 `safeFetchBuffer` 不因端口白名单被拦（只用 80/443/8080/8443；若 CDN 走非常规端口会报「图片下载失败」，届时看日志再决定是否加端口）。
4. **语音**：发一条 `qq_send_voice`，确认 tts 接线与 `mcp__voice-tts__` 未被守卫误挡。
5. **记忆**：跑一轮唤醒，看 prompt 里是否同时出现 `【跨会话记忆】`（我方 `longTermMemoryLine`）与 `【记忆卫生】`（Preset 段落），确认块 19 没把记忆行丢掉。
6. **B 站简报**：`qq-bridge-addons` 的 `mcp__bili-digest__` / `mcp__bili-local__` 仍在白名单；真机触发一次视频摘要。
7. **忙标记**：重启桥接后立刻 @ 一次，应当在 ~45s 内被正常唤醒（而不是等 15 分钟）——这是 `RESTORED_TURN_GRACE_MS` + `releaseStuckBusyV2` 的组合，本单两块都保住了。
8. **出错提示**：制造一次 DSH 报错（例如临时把 DSH 端口指错），确认群里收到的是 `⚠️ 暂时无法处理消息，请稍后再试。`，5 分钟内不重复；顺带确认 `closed-agent` 模式下也会收到这一条（上游语义；若你觉得该模式必须静默，那属于 §5 的拍板项，改法是在 `reportTurnFailure` 的静默条件里补 `closed-agent`，但会与上游用例冲突）。
