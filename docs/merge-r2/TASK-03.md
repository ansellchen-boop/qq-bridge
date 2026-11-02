# TASK-03：解 `src/bridge.js` 的 35 个冲突块（最后一段）

## 只读 / 可写边界

- **可写**：`/home/ubuntu/qq-bridge-upgrade/` 内的一切（含 `.git`）。
- **禁止碰**：`/home/ubuntu/qq-bridge/`、远端 `/root/qq-bridge`、任何 `git push` / `ssh` / `systemctl`。
- **禁止 `git commit`**（merge 收尾由人拍板）。**禁止 `git merge --abort` / `git reset` / `git checkout --ours/--theirs` 整文件覆盖。**
- 允许 `npm install`（依赖上一单已装好，一般不用再跑）。

## 当前状态

分支 `upgrade/r2`，merge 进行中。**只有 `src/bridge.js` 一个文件未解，35 个冲突块。**
其余 29 个冲突文件已全部解完并 `git add`（两单的报告：`MERGE-REPORT.md`、`REPORT-src-part1.md`，**先读这两份**，尤其 `REPORT-src-part1.md` 的第 5 段——那里把你这一单要用的行号、常量、断言都列好了）。

## 一条已核实的关键事实（别再犯我在评估时犯的错）

`encodeSelfKey` / `BOUND_SESSION_ID_RE` / `boundSessionId` / `retireSession` **已经在 `src/bridge.js` 的非冲突区里正确存在**（`:1494`、`:1497`、`:9054`、`:9107–9108`、`:3354`）。它们是上游 r2 的新增并被自动合并进来了，**不在 35 个冲突块内**。

⇒ 你**不要**去动 `ensureSession()` 那一段，也不要去「补上」sessionId 注入——它已经在了。你只要在解冲突时别把它弄丢，并在解完后按下文验收第 ④ 条确认它还在。

## 必做项（解冲突时容易漏、漏了要出事）

### A. `MEDIA_FETCH_ALLOW_PORTS`（漏了会 ReferenceError）

`:8471` 那个冲突块里有上游新增的常量定义：

```js
// 媒体抓取的端口白名单：只允许常规 Web 端口（与 web-search 的 web_fetch 对齐）。
const MEDIA_FETCH_ALLOW_PORTS = [80, 443, 8080, 8443];
```

HEAD 侧这一块为空。**必须取上游侧**，否则下面这些引用全部 `ReferenceError`。

以下 5 个调用点必须都带上第三个参数 `{ allowPorts: MEDIA_FETCH_ALLOW_PORTS }`（`:6199` 已在非冲突区带好，别动；其余 4 个在冲突块里）：

| 行 | 函数 | 期望写法 |
|---|---|---|
| `:2173` | `sendStickerV2` | `safeFetchBuffer(url, MAX_MEDIA_BYTES, { allowPorts: MEDIA_FETCH_ALLOW_PORTS })` |
| `:8600` | `fetchOneBotImage` 的 `tryUrls` | 同上 |
| `:8633` | `fetchOneBotImage` 的 `tryGetImage`（`obj.url`） | 同上 |
| `:8680` | `fetchFaceMedia`（`face.url`） | 同上 |
| `:6199` | 控制台媒体抓取 | 已在非冲突区，别动 |

⚠️ 端口白名单是 **opt-in**：不传 `allowPorts` 就**不限端口**（上一单实测 `http://example.com:22/` 会真去连）。所以这不是「可选优化」，是必须带。

### B. `sendStickerV2` 的取图顺序（`:2170`）

表情与普通图片的回退顺序**不能解反**：

```js
isSticker ? (await tryUrls()) ?? (await tryGetImage()) : (await tryGetImage()) ?? (await tryUrls())
```

表情优先走 CDN、普通图片优先走 `get_image`——这是 `src/sticker-lib.js` 里「表情 CDN 优先 + `emoji_id` 兜底」语义的调用侧，`scripts/test-media-search.mjs` 有五条用例盯着它。

### C. `buildWakePromptV2`（`:11467–11583`）

我方这两块的文案必须留：**会话隔离 / 记忆卫生 / 「不要当群管家」**；同时接收上游 r2 的**角色卡节奏注入**（`role.injectEveryNWakes`、换卡完整注入、`buildWakeReminderPromptV2` 同回合不重复整卡）。
上游 r2 把这个函数重命名过（报告里写作 `buildWakePromptV2`），改名后**所有调用点**（`:11640` `sendWakePromptV2`、`:11932–11968`、console 侧）都要跟着改，别留旧名。

### D. `appendSocialV2Message`（`:10932`）

R16 断言要求保留 `kind` / `emojiId` / `summary` / `subType` 四个字段（媒体摘要要给模型看）。

### E. `:5553` wake `keywords` 归一

我方用 `splitKeywordString`（来自 `./wake-config-alias.js`）。上游 r2 换成 strict schema + `normalizeWakeArguments`。**这里两边都能跑**——保留我方 `splitKeywordString` 的调用（模块仍在 `:26` import），同时接受上游的 strict 校验，两边并存不冲突。

## 其余冲突块（`REPORT-src-part1.md` §5.4 有完整行号表，照它逐块过）

`:2696` `fetchModelCatalog` ｜ `:3098` `rebuildInFlightCollector` ｜ `:4068` `startConsoleServer`（含 `:5415` sticker 工具旗标、`:6129` 发送限频、`:6802` wait 租约）｜ `:9837` `formatMemoryV2` ｜ `:11362` `buildTimeSenseLine` ｜ `:11752` `scheduleReplyCheckV2` ｜ `:11782` `releaseStuckBusyV2` ｜ `:11812` `isConversationBusyV2` ｜ `:11856` `wakePriorityV2` ｜ `:11917` `scheduleWakeV2` ｜ `:12311` `handleIncoming` ｜ `:12657` `trackTurnEvent` ｜ `:13023` `pumpMux`。

判定规则同前两单：上游新增能力一律接受（含 `:4045` 一带的 `RESTORED_TURN_GRACE_MS = 45 * 1000` 恢复宽限、`autoDiscoverPort`、幂等入库、发送队列按会话分链）；我方自有能力一律保留（`media-normalize`、`yesterday-digest` 工厂、`token-ledger`、`agent-error-notice`、`web-search` 主路径、`sticker` 情绪触发、bili / tts 接线、`wake-config-alias`）；两边同一处 → 保行为、宁可多写几行。

## 分批解 + 落盘（重要，防止你中途跑不完）

35 块一口气解完容易把上下文烧干。要求：

1. 按行号从小到大，**每解完约 8–10 块就停手一次**，把当前进度写进 `MERGE-PROGRESS.md`（已解块号 / 剩余块号 / 下一个要解的函数名 / 发现的坑）。
2. 全部解完后把 `MERGE-PROGRESS.md` 最后一节改成「已全部解完」。
3. 如果你在某一批之后确实跑不动了：**保证文件此时没有「解了一半」的语法破坏**（要么整块留着冲突标记、要么整块解完），然后停手并写清剩余块号。我们下轮 `--resume` 接着干。

## 验收（自己跑，输出原文贴进报告）

```bash
cd /home/ubuntu/qq-bridge-upgrade

# ① 全部冲突解完（期望 0，无输出）
git diff --name-only --diff-filter=U

# ② 文件里没有残留冲突标记（期望 0）
grep -c '^<<<<<<<' src/bridge.js

# ③ 语法
node --check src/bridge.js && echo 'OK bridge.js'

# ④ 三件已核实的东西还在（期望每项 ≥1，且不在冲突区）
grep -c 'encodeSelfKey' src/bridge.js
grep -c 'BOUND_SESSION_ID_RE' src/bridge.js
grep -c 'MEDIA_FETCH_ALLOW_PORTS' src/bridge.js      # 期望 6

# ⑤ 全量回归（这是最终判据）
npm run test:audit 2>&1 | tail -40
```

`npm run test:audit` 的基线：我们有 35 条、上游 r2 有 57 条，合并后条数会变。**判绿看 fail 数 = 0**，不要拿 35 或 57 当期望值。跑之前先 `git add src/bridge.js`（测试脚本读工作区文件，但让索引状态干净一点更方便排错）。

如果某条测试红，先判断是「我们能力退化」还是「上游新用例要求我们改行为」：
- 前者 → 回去修你的冲突决策；
- 后者（新用例断言了我们没有的行为）→ **不要为了让测试变绿去删用例**，把它记进报告的「需要人拍板」段。

## 产出：`REPORT-bridge.md`

六段：

1. **逐块决策表**：`行号 | 函数 | 决策（上游/我方/融合） | 理由 | 风险`（35 行都要有）
2. **被丢弃的上游内容**（无则写「无」+ 检查依据）
3. **被丢弃的我们的内容**（理想「无」）
4. **`npm run test:audit` 结果原文**（含 fail 明细）
5. **需要人拍板的点**（`version` 字段、LICENSE、`test-installed-preset-sync.mjs` 怎么办、任何你不确定的）
6. **上线前的真机验收清单建议**（升级后第一轮该盯哪几个点：会话 id 重建、QQ 工具能不能用、表情能不能发、语音、记忆、B 站简报）

## 自检

- 收工最后一条命令：`git diff --name-only --diff-filter=U | wc -l`，期望 `0`。
- `git status --porcelain` 里除 `src/bridge.js`、`MERGE-PROGRESS.md`、`REPORT-bridge.md`、两个 `TASK*.md` 外不应有别的未登记改动。
- 卡住就停手写清楚，别猜着往下冲。
