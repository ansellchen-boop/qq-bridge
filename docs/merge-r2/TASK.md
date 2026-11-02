# TASK-01：合并上游 v0.2.1-r2，先解「非 src」冲突

## 只读 / 可写边界（第一段，违反即整单作废）

- **可写**：`/home/ubuntu/qq-bridge-upgrade/` 里面的一切（含 `.git`）。
- **禁止碰**：`/home/ubuntu/qq-bridge/`（另一个留档仓）、远端 `/root/qq-bridge`、任何 `git push` / `git remote set-url` / `npm publish` / `systemctl` / `ssh`。
- **禁止**跑 `npm install`。依赖目录现成与否不重要，本单只做源码合并。
- 只在本目录操作，不要往 `~/`、`/tmp` 以外的地方写文件。临时文件放 `~/.hermes/cache/scratch/`。

## 背景

本仓是 `qq-bridge` 的 fork，`origin` = `ansellchen-boop/qq-bridge`，`upstream` = `Derpyu520/qq-bridge`。
当前 `main` HEAD = `c1e9e57`（= 上游 `v0.2.1-r1` + 15 个自有 commit）。
要升级到上游 tag **`v0.2.1-r2`**（`b77e4a26`）。

上游 r2 动了 52 个 commit、89 个文件；我们在 r1 之后也改了 88 个文件。两边撞在同一批文件上，预演结果：**30 个文件冲突 / 100 个冲突块**，其中 `src/` 下占 7 个文件 55 块，**其余 23 个文件**属于本单范围。

## 本单目标（只做第一段，不要往下做）

1. 确认工作区干净，从当前 `main` 建分支：`git switch -c upgrade/r2`
2. `git merge --no-commit --no-ff v0.2.1-r2`
3. **解掉冲突文件里所有不在 `src/` 下的**（预期 23 个，逐条核对：
   `LICENSE`、`README.md`、`README.en.md`、`start.bat`、`package.json`、`package-lock.json`、
   `dsh/agent-presets/qq-chat-v2/agent.cordis.yml`、`plugins/qq-agent-presets/package.json`、
   `plugins/qq-agent-presets/presets/qq-chat-v2.patch.yml`、`plugins/qq-agent-presets/qq-tool-restrict.mjs`、
   `plugins/qq-mode-console/package.json`、`roles/小鲸鱼.md`、
   `scripts/audit-bridge-harness.mjs`、`scripts/test-audit-regressions.mjs`、`scripts/test-audit-security-mcp.mjs`、
   `scripts/test-audit-setup-guards.mjs`、`scripts/test-audit.mjs`、`scripts/test-issue-regressions.mjs`、
   `scripts/test-media-search.mjs`、`scripts/test-preset-local-tools.mjs`、`scripts/test-preset-prompt.mjs`、
   `scripts/test-tool-restrict-guard.mjs`、`scripts/test-voice-system.mjs`）
4. **`src/` 下的 7 个冲突文件一个都不要解**，保持冲突态原样留着（下一单专门处理）：
   `src/bridge.js`、`src/safe-fetch.js`、`src/web-search.js`、`src/sticker-lib.js`、
   `src/mcp-snowluma-safe.js`、`src/mcp-web-search-safe.js`、`src/qq-model-view.js`
5. 不要 `git commit`、不要 `git merge --abort`、不要 `git checkout`/`git reset` 掉冲突态。收工时必须停在「merge 进行中」的状态。
6. 写 `MERGE-REPORT.md`（格式见末尾）。

## 合并原则（本单最重要的部分）

- **上游新增能力一律接受，不许因为「我们没用到」而丢**：会话绑定 SELF_KEY、SSRF/端口收紧、`dsh.autoDiscoverPort`、`role.injectEveryNWakes`、黑话/备注 `scope` 隔离、新测试脚本、新 CI 配置。
- **我们自有能力一律保留**，冲突处以上游结构为骨架、把我们的改动嫁接进去。
- **两边改同一处的，保「行为」不保「字面」**：宁可多写几行把上游的新参数和我们的判断分支都留下，也不许二选一删掉一边。
- **禁止用 `git checkout --ours` / `--theirs` 整文件覆盖**。唯一例外：某文件整体上只有一边真正改过（另一边只是格式化），这种情况下报告里必须写出判断依据。
- **禁止删任何测试用例**。我们新增的测试脚本和上游新增的测试脚本要同时存在；同一脚本里两边的用例都要留。
- `package.json`：`scripts` 与 `dependencies`/`devDependencies` 取**并集**；`version` 字段**保持 `0.2.1-r1` 不变**，改不改由人拍板，你在报告里给建议。
- `LICENSE`：上游 r2 把协议从 MIT 换成了 PolyForm Noncommercial 1.0.0。**以 upstream 版为准确落**，但我们原文件里我们这边的版权行（如有）要保留在 NOTICE 或文件头注释里。报告里写清这一点。
- `roles/小鲸鱼.md`：以上游版为骨架，把我们这版的差异（人格段、说话规矩）并进去，**不许整份覆盖成上游版**。

## 我们的自有能力清单（逐条核对，一条都不能丢）

先自己跑 `git log --oneline v0.2.1-r1..HEAD` 确认这 15 个自有 commit，再逐条核对这些能力在合并后还在：

1. qq-memory 接线：preset 里第 18/19 条记忆工具说明 + `SAFE_PREFIXES` 放行 `mcp__qq-memory__`
2. voice：`qq_say_voice` 返回真实 `verified`、`target` 改必填；Fish Audio 分支
3. 表情包改情绪触发（`src/sticker-lib.js` 是本单不管的 src 文件，但 preset/角色卡里对应的描述要留）
4. 角色卡 v4.1 与 `qq-chat-v2` 预设对齐的那份内容
5. digest 拆成纯函数 + 工厂、新增「主动提一句」
6. bili-digest / tencent-tts MCP server 接线
7. 注入防护 + 错误提示去重 + 唤醒配置归一
8. `scripts/qq-loop-check.mjs`、`scripts/hooks/pre-commit`、`.nvmrc`
9. `scripts/test-audit*.mjs` 里那些「适配我们 voice base64 路径 / ffprobe 4.4」的用例

## 验收（你自己跑，输出原文贴进报告）

```bash
cd /home/ubuntu/qq-bridge-upgrade

# ① 未解冲突只剩 src/
git diff --name-only --diff-filter=U
git diff --name-only --diff-filter=U | grep -c -v '^src/'      # 期望 0

# ② src/ 那 7 个确实还在冲突态（期望 7）
git diff --name-only --diff-filter=U | grep -c '^src/'

# ③ 冲突标记没漏在非 src 文件里（期望无输出）
grep -rn '^<<<<<<<\|^>>>>>>>' --include='*.mjs' --include='*.json' --include='*.yml' --include='*.bat' --include='*.md' . --exclude-dir=node_modules --exclude-dir=.git | grep -v '^./src/'

# ④ 语法：所有非 src 的 js/mjs 都能过
for f in $(git diff --name-only --diff-filter=U HEAD | grep -v '^src/' | grep -E '\.(mjs|js|cjs)$' | sort -u) ; do node --check "$f" || echo "FAIL $f"; done

# ⑤ JSON 可解析
node -e "for (const p of ['package.json','plugins/qq-agent-presets/package.json','plugins/qq-mode-console/package.json','package-lock.json']) { JSON.parse(require('fs').readFileSync(p,'utf8')); console.log('OK', p); }"
```

注意：`node` 是 `v22.23.3`（仓库 `.nvmrc` 写的是 v24，但本机没有 v24，别去装）。

## 产出：`MERGE-REPORT.md`

必须包含这五段，缺一段算没做完：

1. **逐文件决策表**：`文件 | 冲突块数 | 决策（取上游/取我们/融合） | 理由（一句话） | 风险`
2. **被丢弃的上游内容**：逐条列。**如果没有，写「无」**——但要真的检查过（至少对每个文件 diff 过上游侧分支）
3. **被丢弃的我们的内容**：同上，理想是「无」
4. **未解冲突清单**：src/ 那 7 个文件 + 每个文件大致多少块，留给下一单
5. **需要人拍板的点**：`version` 字段怎么填、LICENSE 措辞、其他你判断不了的事

报告写中文，带上第 4 节验收命令的**原始输出**。

## 自检

- `git status` 里 `MERGE-REPORT.md` 与 `TASK.md` 是新增未跟踪文件，属正常。
- 收工前最后一条命令必须是 `git diff --name-only --diff-filter=U | wc -l`，把数字写进报告（期望 7）。
- 中途卡住或判断不了，**不要猜着往下冲**：停手，把问题写进 `MERGE-REPORT.md` 的「需要人拍板的点」并存盘。
