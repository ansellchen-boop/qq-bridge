# MERGE-PROGRESS（src/bridge.js 冲突收尾 · TASK-03）

分支 `upgrade/r2`，`git merge --no-commit --no-ff v0.2.1-r2` 进行中。

## 当前进度

- 已解块（按解前 35 块编号）：**1–24 全部解完**（第一批 1–12 用 edit 落盘，第二批 13–24 用 /tmp/apply2.py 落盘）。
- 剩余块（解前编号）：**25–35，共 11 块**，都集中在 `isConversationBusyV2` / `wakePriorityV2` / `replayPendingWakeReasonsV2` / `handleIncoming` / `trackTurnEvent` / `pumpMux` 一带。
- 下一个要解的函数：`isConversationBusyV2`（取 HEAD 空侧，上游那句 `const sid = state.sessions[key];` 会与函数开头已有声明重复 → SyntaxError）。
- 文件状态：剩余 11 块**冲突标记完整**（没有解了一半的块），`node --check` 现在必然报 `Unexpected token '<<'`，属预期；解完最后一并验。

## 本批（13–24）的关键决策

| 块 | 函数 | 决策 |
|---|---|---|
| 13 | formatMemoryV2 话题陈旧阈值 | 我方 24h（上游 2h，属我方调优） |
| 14 | formatMemoryV2 印象 traits | 我方 traitText（逐条补「；」） |
| 15 | appendSocialV2Message | 上游 messageId 幂等去重（seenMessageIds / MAX_SEEN_MESSAGE_IDS）；我方 media 归一化注释在非冲突区，未受影响 |
| 16 | buildTimeSenseLine | 我方 sender 过 `sanitizeUntrustedText` |
| 17 | buildWakePromptV2 roleLine | 上游 `roleForWake` 节奏注入 |
| 18 | buildWakePromptV2 stickerLine | 融合 `promptMaxStickers ?? 20, key`（保留我方默认 20 + 上游会话隔离） |
| 19 | buildWakePromptV2 base 拼接 | 融合：上游顺序 + 补回 `longTermMemoryLine` / `webToolLine` |
| 20 | triggeredLine | 我方 sanitize |
| 21 | 主 return + buildWakeReminderPromptV2 头 | 融合：主 return 用我方（引用/点名规则、主动机会 `web_search`），reminder 用上游（只给一行「继续按角色卡说话」，不重复整卡） |
| 22 | sendWakePromptV2 限频重试 | 上游（点名类即使未读清空也补发） |
| 23 | releaseStuckBusyV2 整函数 | 取我方（上游完全没有此函数，`busyReasonV2`/`isConversationBusyV2` 里在调它） |
| 24 | busyReasonV2 后空行 | 我方空侧 |

## 已知坑

- 第 7 块：上游把 `captureSendGuard(key, { ai: true })` 提前到控制台 sticker 分支之前，HEAD 那行 `captureSendGuard(key)` 若留着会同作用域重复声明 → 删我方那行。
- 第 21 块跨了一个函数边界（`buildWakePromptV2` 的 return 与 `buildWakeReminderPromptV2` 的头部），必须分别取两侧，不能整块 one-side。
- 第 25 块（下一个）：上游 `const sid` 与函数顶部已有声明重复，取 HEAD 空侧。

## 已全部解完

35 块全部解完，验收 ①–④ 全绿（`git diff --name-only --diff-filter=U` 空、`grep -c '^<<<<<<<'` = 0、`node --check` OK、四个关键字 grep 3/2/6 达标）。
`npm run test:audit`（收尾复跑，含人工补的两处修复）：`Audit suite: 56/57 scripts passed.`，唯一失败是 `test-restart-instance.mjs`（上游纯净 worktree 同样 4 红，非合并造成）。`test-tool-restrict-guard.mjs` 的合并回归已由人工修复（全失败也落诊断），现 4/4 PASS。
详情、逐块决策、拍板项、真机验收清单见 `REPORT-bridge.md`。**未 commit**（按任务单由人拍板）。
