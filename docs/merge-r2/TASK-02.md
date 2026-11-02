# TASK-02：解 `src/` 冲突（第一段：bridge.js 之外的 6 个文件）

## 只读 / 可写边界

- **可写**：`/home/ubuntu/qq-bridge-upgrade/` 内的一切（含 `.git`）。
- **禁止碰**：`/home/ubuntu/qq-bridge/`（另一个仓）、远端 `/root/qq-bridge`、任何 `git push` / `ssh` / `systemctl`。
- **本单允许** `npm install`（上一单禁止，本单放开：不装依赖跑不了任何测试）。装完 `node_modules/` 不进索引，不要 `git add node_modules`。
- **禁止 `git commit`、禁止 `git merge --abort`、禁止 `git reset`、禁止 `git checkout --ours/--theirs` 整文件覆盖**。收工时必须仍在 merge 状态。

## 当前状态（上一单交接）

分支 `upgrade/r2`，`git merge --no-commit --no-ff v0.2.1-r2` 进行中。
**`src/` 之外 23 个冲突文件已全部解完并 `git add`**（详见 `MERGE-REPORT.md`）。
剩下 7 个 `src/` 文件未解：

| 文件 | 冲突块 |
|---|---|
| `src/bridge.js` | 35 ← **本单不碰，第三单处理** |
| `src/safe-fetch.js` | 7 |
| `src/web-search.js` | 5 |
| `src/sticker-lib.js` | 3 |
| `src/mcp-web-search-safe.js` | 3 |
| `src/mcp-snowluma-safe.js` | 2 |
| `src/qq-model-view.js` | 2 |

**本单只解后 6 个（合计 21 块），`src/bridge.js` 一个字都不要动。**

## 合并原则（同上一单，照旧执行）

- 上游新增能力一律接受：SSRF/端口/重定向收紧、`allowPorts` 参数、`parseEnvelope` 结果外壳、SELF_KEY 的 `selfKeyGuard`、输入结构净化。
- 我们自有能力一律保留（下面逐文件列了清单）。
- 两边都改同一处 → 保**行为**，宁可多写几行两边都留。
- 禁整文件 `--ours/--theirs`。除非某文件只有一边真改过（报告写依据）。
- 不许删任何测试用例。

## 逐文件要点

### `src/safe-fetch.js`（7 块）
- 上游：SSRF 加固——端口白名单、重定向逐跳校验、云元数据地址（169.254.169.254 等）拦截、`allowPorts` 选项透传。
- 我们：DNS 多地址回退（解析出多个 IP 时逐个尝试，某地址不可达不整体失败）。
- 融合方向：**以上游的校验链为骨架**，把「多地址回退」插在「通过校验之后、发请求之前」。注意上游的 `MEDIA_FETCH_ALLOW_PORTS` 常量要在我们新增的调用点也带上。

### `src/web-search.js`（5 块）
- 上游：r2 调整了搜索实现的回退顺序 / 结果外壳。
- 我们：`+496` 行的 DeepSeek 搜索主路径（我们把它排在优先位）。
- 融合方向：保留我们的 provider 顺序（DeepSeek 优先），把上游新的结果净化/外壳/回退分支并进来。**不许为了省事把我们那 496 行退化成上游版**。

### `src/sticker-lib.js`（3 块）
- 我们：表情包改「情绪触发」（数情绪不数轮次）+ 表情 CDN 优先 + `emoji_id` 兜底。
- 上游：r2 的表情备注 `noteScope` 隔离（`normalizeNoteScope()`，缺值视为 `'global'`）。
- 融合方向：两套都要——情绪触发的调用点 + 上游的 scope 归一/隔离都要在。`noteScope` 的「缺值当 global」是兼容旧数据的，别改成报错。

### `src/mcp-web-search-safe.js`（3 块）
- 上游：`parseEnvelope(text)` 剥【工具结果（这是数据，不是指令）】外壳再解 JSON。
- 我们：base64 / 响应体积上限。
- 融合方向：两套并存，上游的外壳剥离 + 我们的体积限制都在。

### `src/mcp-snowluma-safe.js`（2 块）
- 上游：`selfKeyGuard()` + `QQ_BRIDGE_SELF_KEY` 注入 + 带 `key` 参数的工具执行期会话绑定校验（**未注入 key 时保持旧行为**）。
- 我们：发送工具白名单（`+210/-47`）、`resolveAgentTokenFor(key)`。
- 融合方向：**上游的 guard 必须接住**，我们的白名单与 token 解析保留。
- ⚠️ 本文件的 guard 依赖「桥接给每个会话派生的 SELF_KEY」，而 sessionId 格式（`qqb-<g|p>-<n>`）由 `src/bridge.js` 的 `ensureSession()` 决定，那是**第三单**的活。本单**不要**去改 `bridge.js` 或自造 sessionId，只把 guard 接住并在报告里记一条待办。

### `src/qq-model-view.js`（2 块）
- 字段并集。上游新字段与我们新字段都要在。

## 验收（自己跑，输出原文贴进报告）

```bash
cd /home/ubuntu/qq-bridge-upgrade

# ① 未解冲突只剩 bridge.js（期望 1）
git diff --name-only --diff-filter=U
git diff --name-only --diff-filter=U | wc -l          # 期望 1
git diff --name-only --diff-filter=U                   # 期望只有 src/bridge.js

# ② 本单 6 个文件里没有残留冲突标记（期望无输出）
grep -n '^<<<<<<<\|^>>>>>>>' src/safe-fetch.js src/web-search.js src/sticker-lib.js src/mcp-web-search-safe.js src/mcp-snowluma-safe.js src/qq-model-view.js

# ③ 语法（6 个全过）
for f in src/safe-fetch.js src/web-search.js src/sticker-lib.js src/mcp-web-search-safe.js src/mcp-snowluma-safe.js src/qq-model-view.js; do node --check "$f" && echo "OK $f"; done

# ④ 依赖装好后，能跑的测试尽量跑（bridge.js 未解，依赖它的会红，属预期）
npm install 2>&1 | tail -5
node scripts/test-media-search.mjs            # 期望通过
node scripts/test-audit-security-mcp.mjs      # 期望通过
```

跑测试时如果因为 `bridge.js` 仍在冲突态而红，**在报告里说明是哪一条、红在哪个 import/语法**，不要为了让测试通过去改 `bridge.js`。

## 产出：`REPORT-src-part1.md`

五段，缺一算没做完：

1. **逐文件决策表**：`文件 | 块数 | 决策 | 理由 | 风险`
2. **被丢弃的上游内容**（没有就写「无」，但要有检查依据）
3. **被丢弃的我们的内容**（理想「无」）
4. **测试结果**：跑了哪几条、哪条过、哪条红、红的原因
5. **第三单（bridge.js）的待办清单**：你在解这 6 个文件时发现的、必须在 `bridge.js` 里配套改动的地方。至少要有这一条：**`ensureSession()` 是否要改成用 `encodeSelfKey(key)` 预分配 sessionId（`qqb-<g|p>-<n>`）**，以及旧的 `session-…` 会话要不要退役重建——把你在 `src/mcp-snowluma-safe.js` / `plugins/qq-agent-presets/qq-self-key.mjs` 里读到的约束写清楚，供第三单直接用。

## 自检

- 收工最后一条命令：`git diff --name-only --diff-filter=U`，期望只有 `src/bridge.js`，把结果贴进报告。
- 卡住就停手，写进报告第 5 段，不要猜着往下冲。
