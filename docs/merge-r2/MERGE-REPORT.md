# MERGE-REPORT：合并上游 `v0.2.1-r2`（第一段：只解非 `src/` 冲突）

- 仓库：`/home/ubuntu/qq-bridge-upgrade`
- 分支：`upgrade/r2`（从 `main` = `c1e9e57` 切出）
- 合并命令：`git merge --no-commit --no-ff v0.2.1-r2`（`v0.2.1-r2` = `b77e4a26`）
- merge-base：`9df6a7e`（注意：不等于 tag `v0.2.1-r1` = `abda6bf`，r1 之后我们还有 `3d0bb8b`/`cf3bd5f` 等提交）
- 当前状态：**merge 进行中，未 commit、未 abort**；索引里已 `git add` 23 个非 `src/` 冲突文件，`src/` 下 7 个仍为冲突态（`git diff --diff-filter=U` 只剩它们）。

> 关于本勾「冲突块数」的口径：下面表里的数字是事后用 `git merge-file -p <ours> <base> <theirs>` 复算的块数（可复现），
> 与当初 `git merge` 自己报的块数偶有 ±1 差异（递归合并的 rename/内容启发式不同）。非 `src/` 合计 46 块，`src/` 合计 57 块。

---

## 1. 逐文件决策表（23 个非 `src/` 冲突文件）

| 文件 | 冲突块数 | 决策 | 理由 | 风险 |
| --- | --- | --- | --- | --- |
| `LICENSE` | 1 | 取上游 | 上游 r2 把主体换成 PolyForm Noncommercial 1.0.0，并把 r1 的中文附录（第三方组件与合规边界 / 数据出机清单）整体迁进新文件 `NOTICE.md`；我们相对 base 只有 1 行改动（`web_search` 目的地写 DeepSeek 优先），已由 `NOTICE.md` §四「数据传输」完整覆盖（含「可将 `webSearch.provider` 设为 `bing` 或 `deepseek`」）。**版权行两边完全相同**（`Required Notice: Copyright 2026 Derpyu520 and qq-bridge / QSH contributors`），我方没有独有版权行，所以无需在 `NOTICE` 或文件头另存 | 中：仓库协议从 MIT 变成「非商业」，属于**法律口径变更**，需人拍板（见 §5） |
| `README.md` | 3 | 融合 | 用上游 r2 的新壳（`# qq-bridge` 标题 / `[English]·[安装指南]·[问题反馈]` / `[!IMPORTANT]` 独立第三方声明 / 示意图 / `## 能做什么` 表 / `## 快速开始` 4 步 / `## 文档与开发` 表 / `## 使用边界与许可`）包住我方全部长文（`## 架构` / `## 前置条件` / `## 安装与配置` / `## 完整启动流程` / `## 运行与运维` / `## 自测` / `## 目录结构` / `## SnowLuma 版本与上游健康` / `## 已知限制`），我方版本 banner（r4 / v0.2.1-r1 说明）整段保留 | 中：458 行，比上游 101 行长得多，且与 `docs/guides/DSH_SETUP.md` 有内容重叠 |
| `README.en.md` | 2 | 融合 | 同中文版：上游英文短版结构 + 我方 `## Architecture` / `## DSH Setup on Another Device` / `## Security Notes` / `## Repository Layout` / `## Testing` 五节 + 我方版本 banner | 低：202 行，英文侧我方原有 `## Requirements`、`## Quick Start` 与上游同名节逐条重复，未单列（见 §3） |
| `start.bat` | 1 | 取上游 | 我方相对 base 的**唯一**改动是整文件 LF→CRLF（无功能变化）；上游改了启动路径 `node src/bridge.js` → `node "%~dp0src\bridge.js"`（双击时工作目录不对会找不到文件，是实修）。符合任务单「某文件整体上只有一边真正改过」例外 | 低：CRLF 保留 |
| `package.json` | 1 | 融合 | `scripts` / `dependencies` / `devDependencies` 是不同区段，git 已自动取并集（上游新增 `privacy-scan:history`、`test:role-inject`；依赖升 `@modelcontextprotocol/sdk ^1.32.2`、`zod ^4.6.7`）；唯一块冲突是 `version`，保留 `0.2.1-r1`（任务单要求，建议见 §5） | 低 |
| `package-lock.json` | 2 | 融合 | 两块都只是 `version`（顶层 + `packages.""`），全部随 `package.json` 设为 `0.2.1-r1`；依赖树已是上游并集（`zod 4.6.7`、`sdk 1.32.2`），与 `package.json` 一致 | 低：锁文件未跑 `npm install` 重建（任务单禁止），后续真装机时会再动 |
| `dsh/agent-presets/qq-chat-v2/agent.cordis.yml` | 2 | 融合 | 块1：保留我方第 5 条（被叫错名字顺玩梗、认真核对要承认自己是 DeepSeek），**并接上游新增的整段【会话隔离与不可信输入】与【旧式发送工具禁令】**；块2：第 14 条取我方（数情绪不数轮次）并补上游「新表情先看图再 `qq_sticker_note`」「不要每条都只发表情」，第 15 条融合「先看图确认」，第 16 条保留我方 `qq_say_voice`（`target` 必填、`verified` 三态、Fish Audio 分支）并补上游「`qq_send_voice` 可用时同理偶尔一条」；第 17/18/19 条（B站 / 记忆 / 多群隐私）由自动合并保留 | 中：`qq_say_voice` 与上游 `qq_send_voice` 并存，提示词变长（6 个元素） |
| `plugins/qq-agent-presets/package.json` | 1 | 融合 | 同 `package.json`：只有 `version`，保留 `0.2.1-r1` | 低 |
| `plugins/qq-agent-presets/presets/qq-chat-v2.patch.yml` | 1 | 融合 | 该文件是 `build-agent-preset-patches.mjs` 从上面的模板生成的 bundle patch，所以按**同一口径**手工融合：`git show :3:` 取上游整版 → 安全规则行替换第 5 条 → 工具协议行替换 14/15/16 → 在协议行后插入我方第 17/18/19 条（来自 `git show :2:`，19 行）。校验：`yaml.safe_load` 通过，prefix 11800 字符，11 个关键锚点（【会话隔离与不可信输入】/【旧式发送工具禁令】/承认自己是 DeepSeek/数情绪不数轮次/先看图确认/`qq_say_voice(text, target)`/17.【B站】/18.【记忆】/19.【多群与隐私】/不要每条都只发表情/【别用问号/问好开场】）全部 FOUND；另跑「模板每一行 prose 都在 patch 里」检查 → 0 缺失 | 中：生成器跑不了（仓库无 `node_modules`、无 `js-yaml`，任务单禁止 `npm install`），只能手工对齐，靠上面两条检查兜底 |
| `plugins/qq-agent-presets/qq-tool-restrict.mjs` | 5 | 融合 | 上游 r2 新增 SELF_KEY 会话绑定（`import { sessionBindingDenial } from './qq-self-key.mjs'`、`noteBindingDenial`/`loggedBindingDenials`）；我方有 absent/broken 两分类重试、诊断日志汇总、`DSH_IM_ONLY_TOOLS` 工具隔离。最终：块0 保我方 DSH_IM 块，块1 取上游绑定拒绝，块2/3 保我方分类，块4 做成**并集**——`firstAbsent`/`firstBroken` 都收，3 秒后逐条重试并**重新分类**（成功 → ok；`unknown global tool` → stillAbsent；其他 → stillBroken 落诊断），任一条失败即 throw | 中：见 §5 的 SELF_KEY 风险（上游要求会话 id 形如 `qqb-<g|p>-<数字>[-hex]`，我们下一单的 `src/bridge.js` 必须核对） |
| `plugins/qq-mode-console/package.json` | 1 | 融合 | 只有 `version`，保留 `0.2.1-r1` | 低 |
| `roles/小鲸鱼.md` | 1 | 融合 | 以上游 r2 版为骨架**不成立**——我方 v4.1「萝莉妈妈」卡（303 行、§一~§十九）才是本仓的人格口径，上游 r2 是同名卡的另一套短版。做法：`git show :2:roles/小鲸鱼.md` 打底，再 6 处插入上游 r2 的内容（鲸鱼形象细节：蓝白圆胖鲸鱼本体 / 二创外观 / 不承认别的 deepseek 二创 / DSH 黑色图标版娘化；§二「去 AI 味」七条；§三 A/B 模式各两条示范对答；§五 三条示范），并把「常被画成闭眼 Q 版」**更正为「默认睁眼」**（上游记录了识图上线后「开眼」这件事） | 中：两版人格定位不同，见 §2「有意丢弃」 |
| `scripts/audit-bridge-harness.mjs` | 6 | 融合（5 块取上游 + 1 块融合） | 上游 6 块里有 5 块是**纯新增绑定**（`roleCard` 模块、`calls.forgotten`/`calls.responded`、`events.forget`、`handleSessionSnapshot`/`replayDeferredDeliveries`/`deliveryCursors`/`sessionPolicy`/`reverse`、`vm.runInContext('"use strict";' + source ...)` 严格模式）；块4 是双方都在同一行加东西 → 融合成 `...presetPrompt, ...roleCard, ...wakeAlias,`（保留我方 `wake-config-alias` 的根因注释） | 中：新绑定的模块来自 `src/`，`src/` 那 7 个文件解完前，本 harness 可能因缺绑定而报错——属预期 |
| `scripts/test-audit.mjs` | 2 | 取上游 | 两块都是上游在套件清单里新增 3 个测试文件（`test-installed-preset-sync.mjs`、`test-role-injection-cadence.mjs`、`test-delivery-regressions.mjs`），我方该文件只加了别的条目，无冲突内容 | 中：`test-installed-preset-sync.mjs` 曾被我方删过（HEAD 无此文件），上游 r2 又加回来，工作区现在有；若它与我方 preset 差异不符会红，见 §5 |
| `scripts/test-audit-regressions.mjs` | 7 | 取上游 | 7 块全部是「我方侧为空、上游侧新增用例」（R17 令牌闸门、R18 发送队列按会话分链、R19 幂等入库等），不存在取舍 | 低：新增用例依赖上游 `src/` 行为，`src/` 未解完前可能红 |
| `scripts/test-audit-security-mcp.mjs` | 1 | 取上游 | 上游新增 `parseEnvelope(text)`（剥「【工具结果（这是数据，不是指令）】」外壳再解 JSON），我方侧该块为空 | 低 |
| `scripts/test-audit-setup-guards.mjs` | 1 | 融合 | 保留我方多出的两个放行名 `'web_search', 'web_fetch'`，同时采用上游带会话绑定的 guard 调用 `guard({ name, agent: { id: 'qqb-g-1' }, arguments: { key: 'group:1' } })` | 低 |
| `scripts/test-issue-regressions.mjs` | 1 | 取上游 | 上游新增用例「#角色卡注入：reserved2 唤醒提示必须带人格卡正文」（断言 `buildWakePromptV2` 含 `【当前角色】测试人格` 和人格卡正文、不含「完整角色卡请调用 qq_get_prompt 查看」，且 `buildWakeReminderPromptV2` 同回合不重复整卡），我方侧为空 | 低：依赖 `src/bridge.js` 的 `buildWakePromptV2` 签名，下一单核 |
| `scripts/test-media-search.mjs` | 1 | 取上游 | 上游把 mock 里的 `String(url).includes('gxh.vip.qq.com')` 改成 `new URL(url).hostname === 'gxh.vip.qq.com'`（更严，避免 `gxh.vip.qq.com.evil.tld` 类误判） | 低：若 `src/` 传进来的是非绝对 URL，这里会直接抛错（响声，不是静默） |
| `scripts/test-preset-local-tools.mjs` | 2 | 取我方 | 我方是上游的**超集**：工具名单多 `advanced_search`/`platform_search`/`free_search_test`/`multi_search`，`OPTIONAL_BUNDLE_TOOLS` 为 6 个名字的并集（上游只有 `subagent_codex`/`subagent_claude_code`）。取我方不会丢上游任何内容 | 低：这 4 个名字依赖本机装 `deepseek-search-tools`/`dsh-free-search`，CI 上会被 `OPTIONAL_BUNDLE_TOOLS` 放过 |
| `scripts/test-preset-prompt.mjs` | 1 | 取我方 | 我方已把上游的「CRLF 写回」+「LF 写回」两个用例**参数化成同一个循环** `for (const [label, src, wantCrlf] of [['CRLF', crlfSource, true], ['LF', source, false]])`，并多一条「样本应确实包含块尾空行」断言。上游那个独立 LF 用例的全部断言被此循环等价覆盖（见 §3） | 低：等价覆盖，不是删用例 |
| `scripts/test-tool-restrict-guard.mjs` | 2 | 取上游 | 上游给 guard 调用补上 `agent: { id: 'qqb-g-1' }` + `arguments`，并新增 SELF_KEY 断言（`qq_send_message` 的 `target` 别名归一化、`qq_send_group_message`/`qq_reply`/`qq_send_private_message`/`qq_send_burst` 的 `groupId`/`userId` 归一化、拒绝文案 `'该会话不可用'`）。我方该文件只有增行，没有与上游互斥的实现 | 低 |
| `scripts/test-voice-system.mjs` | 1 | 融合 | 上游把断言改成「`docs/guides/VOICE.md` 不存在就跳过」（该文件在 `.gitignore` 里，干净 clone 必然没有）；我方把它改成「退回读 `README.md`」。融合：`const voice = exists(voicePath) ? read(voicePath) : read('README.md')`，先断言「默认关闭」或「默认是关的」（两种措辞任一），再断言 4 个关键词（`图形界面`/`voice-gui.mjs`/`voice-cli.mjs`/`发语音-图形界面.cmd`） | 低 |

---

## 2. 被丢弃的上游内容（逐条，已对每个文件 diff 过上游侧分支）

1. **`roles/小鲸鱼.md`：上游 r2 的「傲娇嘴硬、被怼优先顶回去」人格定位句**，以及与之配套的三段示范——「你再说一遍试试」、「你才胖」、「我不胖」。
   **理由**：我方 v4.1 卡 §一 明确写「她身上**没有凶这个功能**」，被说胖走「诶……？才没有 (・ω・?)」这种软接档。两份卡在这里是**互斥的世界观**，不是措辞差异，逐字合并会自相矛盾。按任务单「两边改同一处保行为不保字面」，这里恰恰是**行为冲突**，只能选一边，选本仓自己的口径（否则整张卡的「萝莉妈妈」基底会被顶穿）。
   **替代**：「被笑/被骂也不生气」上游其余内容（不认输但不翻脸、被怼不冷场）已由我方 §二/§三 覆盖。
2. **`roles/小鲸鱼.md`：上游 §十「你的样子」整节没有单列**。该节的事实（鲸鱼形象、蓝白配色、女仆装、Q 版三头身、被问长相怎么写回应、默认睁眼）**已逐条折进 §一**，属合并同类项，不算丢事实。
3. **`README.md` / `README.en.md`：多出来的一张示意图**。上游图 `QQ ↔ SnowLuma ↔ qq-bridge ↔ DeepSeek Harness ↔ 模型服务` 与我方那张 ASCII 拓扑图表达同一件事；最终只留一张，并把两边的信息并进去（`↔ DeepSeek Harness (127.0.0.1:3080/api) ↔ 模型服务`）。
4. **`README.md` / `README.en.md`：上游 `## 快速开始` 里的 clone 地址** 由 `https://github.com/Derpyu520/qq-bridge.git` 改成 `https://github.com/ansellchen-boop/qq-bridge.git`（本仓 `origin`）。**这是改不是丢**，理由是 fork 的 README 让人 clone 上游仓库会拿到没有本仓能力（记忆工具/语音/情绪表情包）的版本。
5. **其它：无。** 上游 r2 的非 `src/` 改动里，剩下的（新测试脚本、CI 配置、`NOTICE.md`/`CONTRIBUTING.md`/`SECURITY.md`/`docs/*`、`dsh.autoDiscoverPort`、`role.injectEveryNWakes`、SELF_KEY、SSRF/端口收紧）都在自动合并区或本报告 §1 的融合里，没有整块丢弃。

---

## 3. 被丢弃的我们的内容（理想是「无」；下面是三条需要点名的等价替换）

1. **`scripts/test-preset-prompt.mjs` 的独立「LF 写回」用例** → 被我方参数化循环覆盖（同一组断言，`wantCrlf=false` 分支）：`assert.equal(crlfCount, 0)` / `assert.ok(lfOnly > 0)` / `assert.match(next, /prefix: \|-\n/)`。**用例数没减少，断言没减弱。**
2. **`scripts/test-media-search.mjs` 的 `String(url).includes(...)` 判定** → 改为上游 `new URL(url).hostname === ...`（更严）。
3. **`README.en.md` 的我方 `## Requirements` 与 `## Quick Start` 两节** → 与上游 `## Quick start` 开头的前置条件、步骤逐条重复，未单列；我方独有的「`npm install` 会自动跑 postinstall 修补 `@snowluma/sdk` ESM 打包 bug」已作为独立一句补回 `## Quick start` 第 1 步之后。

其余我方内容（`src/` 外的）**逐条核对无丢失**：

| 自有能力 | 落地位置 | 核对结果 |
| --- | --- | --- |
| 1. qq-memory 接线（preset 第 18/19 条 + `SAFE_PREFIXES` 放行 `mcp__qq-memory__`） | `dsh/agent-presets/qq-chat-v2/agent.cordis.yml`（2 处命中）、`plugins/qq-agent-presets/presets/qq-chat-v2.patch.yml`（2 处）、`plugins/qq-agent-presets/qq-tool-restrict.mjs:239` `'mcp__qq-memory__',` | ✅ 在 |
| 2. voice：`qq_say_voice` 真实 `verified`、`target` 必填、Fish Audio 分支 | `agent.cordis.yml` 第 16 条（含 `verified=true/false/unknown` 三态与「target 必填、群聊 `group:<群号>` / 私聊 `private:<QQ号>`」）、`src/mcp-tts-voice.js`（`tts.tencentcloudapi.com` + `TTS_PROVIDER` 默认 `tencent`，Fish 分支） | ✅ 在 |
| 3. 表情包改情绪触发 | `agent.cordis.yml:58`「频率：数情绪，不数轮次——想笑、想附和、想自嘲、想装死、想无语、想摆烂、想道别……」，`roles/小鲸鱼.md` 情绪段保留 | ✅ 在（`src/sticker-lib.js` 属下一单） |
| 4. 角色卡 v4.1 与 `qq-chat-v2` 预设对齐 | `roles/小鲸鱼.md` 全卡打底保留（§一~§十九） | ✅ 在 |
| 5. digest 拆纯函数 + 工厂、新增「主动提一句」 | `src/yesterday-digest.mjs`（`grep -rln '主动提一句'` 命中该文件） | ✅ 在（非冲突区） |
| 6. bili-digest / tencent-tts MCP 接线 | `src/mcp-bili-digest.js`、`src/mcp-tts-voice.js` | ✅ 在（非冲突区） |
| 7. 注入防护 + 错误提示去重 + 唤醒配置归一 | `src/wake-config-alias.js` 存在；`scripts/audit-bridge-harness.mjs` 融合块保留 `...wakeAlias,` 及其根因注释 | ✅ 在 |
| 8. `scripts/qq-loop-check.mjs`、`scripts/hooks/pre-commit`（可执行）、`.nvmrc`（`v24.21.0`） | 三件都在工作区 | ✅ 在 |
| 9. `scripts/test-audit*.mjs` 里「适配我们 voice base64 路径 / ffprobe 4.4」的用例 | `scripts/test-voice.mjs:169` AI 通道拒 `base64:/data:/https?`、`scripts/send-voice.mjs` / `test-audit-bridge.mjs` 的 ffprobe 相关断言（均非冲突文件，自动合并保留） | ✅ 在 |

---

## 4. 未解冲突清单（留给下一单）

`git diff --name-only --diff-filter=U` 输出（7 个，全在 `src/`）：

```
src/bridge.js
src/mcp-snowluma-safe.js
src/mcp-web-search-safe.js
src/qq-model-view.js
src/safe-fetch.js
src/sticker-lib.js
src/web-search.js
```

> 索引状态：其中 6 个是 `UU`（两边都改过），`src/web-search.js` 是 `AA`（两边都当作新增文件加进来）；
> 7 个都仍是 unmerged 状态，冲突标记原样保留（`grep -c '^<<<<<<<'`：bridge 35、safe-fetch 7、web-search 5、
> sticker-lib 3、mcp-snowluma-safe 2、mcp-web-search-safe 2、qq-model-view 2）。

按复算的块数排（`git merge-file` 口径，合计 57 块）：

| 文件 | 冲突块数 | 下一单要留意 |
| --- | --- | --- |
| `src/bridge.js` | 35 | 最大的一块；含会话绑定（SELF_KEY）、`dsh.autoDiscoverPort`、`role.injectEveryNWakes`、黑话/备注 `scope` 隔离、`buildWakePromptV2` 改名、digest 工厂接线 |
| `src/safe-fetch.js` | 7 | SSRF/端口收紧（上游）vs 我方 DNS 多地址回退 |
| `src/web-search.js` | 5 | DeepSeek 搜索主路径（我方）vs 上游 r2 的新实现/回退顺序 |
| `src/sticker-lib.js` | 3 | 我方「情绪触发 + 表情 CDN 优先 + `emoji_id` 兜底」 |
| `src/mcp-web-search-safe.js` | 3 | 上游 `parseEnvelope`/结果外壳 与 我方 base64/大小限制 |
| `src/qq-model-view.js` | 2 | 模型视图字段并集 |
| `src/mcp-snowluma-safe.js` | 2 | 发送工具白名单 + 上游 SELF_KEY 检查 |

---

## 5. 需要人拍板的点

1. **`version` 字段**：本单按任务单要求**保留 `0.2.1-r1`**（`package.json` + 两个 plugin `package.json` + `package-lock.json` 四处一致）。
   我的建议：等 `src/` 那 7 个文件解完、`npm run test:audit` 真绿之后再定，且**不要**直接写上游的 `0.2.1-r2`——那会让人以为我们跟上了一字不差的上游版本。建议 `0.2.1-r2` 由上游保留、我们写 `0.2.1-r2.1`（或 `0.2.2-r1`），并在同一次提交里一起改四处。
2. **LICENSE / 协议口径**：上游 r2 把协议从 MIT 换成 **PolyForm Noncommercial 1.0.0（限非商业）**，我们已按任务单「以 upstream 版为准」落盘。这是**对外法律口径变更**：如果这个 fork 有商业用途、或要分发给别人，需要你确认接受；不接受的话唯一做法是把 `LICENSE` 整份改回 MIT 并在 `NOTICE.md` 写清「本 fork 从其发布版本起沿用 MIT」——但那等于公开与上游分叉，不是合并能解决的事。
   `NOTICE.md` 的版权行仍是 `Copyright 2026 Derpyu520 and qq-bridge / QSH contributors`，**没有加我们自己的名字**；要不要加，你定。
3. **`README` 长度取向**：现在是 458 行（上游 r2 是 101 行，因为上游把运维细节搬进了 `docs/guides/`）。我按「不许丢我方内容」保留了我方长文。若你希望 README 回到「一分钟能看完」，我可以把 `## 完整启动流程` / `## 运行与运维` / `## SnowLuma 版本与上游健康` 三节抽进 `docs/guides/`，README 只留指针——那会**删掉 README 里的正文**，属再一轮决策，本单没动。
4. **`scripts/test-audit.mjs` 重新纳入 `test-installed-preset-sync.mjs`**：该文件曾被我方删除（HEAD 无此文件），上游 r2 又加回来了，现在工作区有它。它校验「仓库里的 preset 模板与装到 DSH 里的 patch 同步」，与我方手工维护的 `qq-chat-v2.patch.yml` 可能对不上。`src/` 解完后如果它红，需要决定是（a）修 patch 让它同步，还是（b）再删掉这个用例（删测试要你点头）。
5. **SELF_KEY 会话绑定 vs 我方的会话 id 格式**（下一单的前置风险）：上游 `src/qq-self-key.mjs` 的 `BOUND_ID_RE` 要求桥接预分配的 sessionId 形如 `qqb-<g|p>-<数字>[-32位hex]`，未绑定会话的 QQ 工具调用一律返回「该会话不可用」。我们 `src/bridge.js` 的会话 id 生成规则（下一单才解）若不一致，升级后**所有 QQ 工具调用会被整片拒绝**。建议下一单第一件事就核这个。
6. **`README` 里 `[问题反馈]` 仍指向上游 issues**（`https://github.com/Derpyu520/qq-bridge/issues`），如果你希望指本 fork 的 issues，说一声我改（属文案，不改行为）。

---

## 附录：验收命令原始输出

第 ④ 条按任务单原文执行（`git diff --diff-filter=U HEAD` 只列**未解**冲突，而非 `src/` 的都已 `git add`，所以该循环列表为空）；因此额外补了一条 ④b，对 12 个已解 `mjs` 实跑 `node --check`。

```
$ git diff --name-only --diff-filter=U
src/bridge.js
src/mcp-snowluma-safe.js
src/mcp-web-search-safe.js
src/qq-model-view.js
src/safe-fetch.js
src/sticker-lib.js
src/web-search.js

$ git diff --name-only --diff-filter=U | grep -c -v "^src/"
0

$ git diff --name-only --diff-filter=U | grep -c "^src/"
7

$ grep -rn "^<<<<<<<\|^>>>>>>>" --include=... . | grep -v "^./src/"
(以上无输出 = 通过；grep 退出码 1)

$ for f in $(git diff --name-only --diff-filter=U HEAD | grep -v "^src/" | grep -E "\.(mjs|js|cjs)$" | sort -u); do node --check "$f" ...; done
(列表为空：非 src 冲突已全部 git add，HEAD..索引 无未解文件；见 ④b 实跑)

$ for f in <12 个已解 mjs>; do node --check "$f"; done
OK scripts/audit-bridge-harness.mjs
OK scripts/test-audit.mjs
OK scripts/test-audit-regressions.mjs
OK scripts/test-audit-security-mcp.mjs
OK scripts/test-audit-setup-guards.mjs
OK scripts/test-issue-regressions.mjs
OK scripts/test-media-search.mjs
OK scripts/test-preset-local-tools.mjs
OK scripts/test-preset-prompt.mjs
OK scripts/test-tool-restrict-guard.mjs
OK scripts/test-voice-system.mjs
OK plugins/qq-agent-presets/qq-tool-restrict.mjs

$ node -e "...JSON.parse(4 个 JSON)..."
OK package.json
OK plugins/qq-agent-presets/package.json
OK plugins/qq-mode-console/package.json
OK package-lock.json

$ python3 -c "yaml.safe_load(两个 yml)"
YAML OK dsh/agent-presets/qq-chat-v2/agent.cordis.yml list 6
YAML OK plugins/qq-agent-presets/presets/qq-chat-v2.patch.yml list 1

$ git diff --name-only --diff-filter=U | wc -l
7
```

收工时刻的未解冲突数：**7**（全部为 `src/`，与期望一致）。
