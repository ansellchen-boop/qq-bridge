// QQ 桥接安全硬边界：只允许 QQ MCP 工具与少量无害模型侧工具。
//
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// 本文件是 qq-agent-presets bundle 里的**唯一权威实现**，由 qq-chat / qq-chat-v2 两个
// agent preset 的 qq-tool-restrict 行共同引用（dsh/agent-presets/<preset>/qq-tool-restrict.mjs
// 只是个 re-export 壳，避免出现两份会漂移的实现）。
//
// 为什么引用方式是「包名/子路径」而不是 `./qq-tool-restrict.mjs`（DSH 0.1.7 的机制变化）：
//   0.1.5 的 preset 是 ~/.dsh/.agent-presets/<preset>/ 目录，相对名按 preset 目录解析；
//   0.1.7 的 preset 变成一条 loader 行，子行 name 按**声明它的 loader 上下文**
//   （= profile 目录 file:///…/.dsh/profiles/<profile>/）解析，因此 `./x.mjs` 会去找
//   profile 根目录下的文件（不存在）。bundle patch 文件只对 insert 行自己的 name 做
//   「相对 patch 文件锚定」（dsh-app-boot 的 anchorInsertedPluginNames），不会走进
//   preset 行的 config.plugins —— 所以守卫只能用**从 profile 目录可解析的裸说明符**。
//   该包以 link: 依赖注册在 profile package.json，node_modules junction 由
//   scripts/setup-dsh.mjs（或 dsh-super-injector 的 dev_heal_links）维护：
//   不写死任何绝对路径，仓库搬家后重建链接即可。
// 作用：
//  1) 用 tools.restrict 把本地执行/文件类工具与开发工具从**工具清单**里隐藏（注册期）；
//  2) 用 tools.guard 白名单兜底：任何不在允许范围内的工具，执行时一律拒绝。
//
// ⚠️ 第 1 条是铁律 L7 的落点，不是"附注"：仿真会话的 preset 永不包含本地工具。
//    `tools.guard` 只能拒绝**执行**，工具名仍会出现在模型的 schema 里——
//    那既不满足"仿真会话不得拥有本地执行能力"的注册期要求，也会诱导模型去调它。
//    所以本地工具必须同时出现在下面的 restrict 名单里。
export const name = 'qq-tool-restrict'

export const inject = ['tools']

/**
 * 本地执行 / 文件访问 / 进程控制类工具：仿真会话**不得**拥有。
 *
 * 名字**逐个核对过** DSH 0.1.7-rc.2 实际注册的工具名（来源包见每条注释），
 * 不是凭印象列举。教训：本名单初版把 `pwsh_persistent`/`bash_persistent`/
 * `cordis`/`goal_write`/`goal_read` 当成工具名，这五个**根本不存在**——
 * 而 `tools.restrict()` 对未知名字会抛错、被下面的 try/catch 逐个吞掉，
 * 于是坏名字**静默失效**。`test-preset-local-tools.mjs` 现在会把本数组与
 * DSH 真实工具名集合求差，专门防这类拼写假名。
 *
 * 2026-09-27 针对 0.1.7-rc.2 重新对账（不是逐个打补丁）：`dsh-tool-cordis` 仍在，
 * 但 `cordis_define`/`cordis_undefine`/`cordis_run`/`cordis_stop` 四个名字**已被删除**，
 * 现在只注册 `cordis_inspect_list`/`cordis_inspect_query`——旧名字留在名单里
 * 只会换来四条静默失效的 restrict（正是本名单最怕的失败模式），
 * 而新名字能读宿主运行期状态，属于必须隐藏的那一类，所以是**替换**不是删除。
 * 同一轮对账还补上了 0.1.7 新增的两个能力：
 *   - `load_workspace_dependencies`（自带 Python/Node/pnpm 的绝对路径 ⇒ 等于递上执行能力）
 *   - `list_subagent_models`（派生 agent 家族，暴露宿主模型路由配置）
 *
 * 来源包（0.1.7-rc.2）：
 *   dsh-tool-pwsh / -pwsh-persistent   → pwsh（persistent 变体注册的就是 "pwsh"）
 *   dsh-tool-bash / -bash-persistent   → bash（同上）
 *   dsh-tool-fs                        → read / read_image / write / edit
 *   dsh-tool-fs-search                 → glob / grep
 *   dsh-tool-str-replace-editor        → str_replace_editor
 *   dsh-tool-workspace-dependencies    → load_workspace_dependencies
 *                                        （返回内置 Python/Node/pnpm 的绝对路径）
 *   dsh-tool-subagent                  → subagent / subagent_fork / list_subagent_models
 *   dsh-tool-subagent-control          → send_message / interrupt_agent / list_agents
 *   dsh-tool-workflow / -ralph         → workflow / ralph
 *   dsh-tool-jobs                      → job_list / job_output / job_kill
 *   dsh-tool-todo / -skill / -present  → todo_write / skill / present
 *   dsh-tool-goal                      → get_goal / create_goal / update_goal
 *   dsh-tool-cordis                    → cordis_inspect_list / cordis_inspect_query
 *                                        （读宿主运行期状态；0.1.7 已无装载类工具名）
 *   dsh-plugin-guard（web profile bundle）→ dsh_snapshot / dsh_rollback / incident_resolved
 *                                        （读写 package.json/lockfile/patch 并 **spawn pnpm**）
 *   dsh-mode-boost（已装插件，当前未进 bundles）→ dev_mode_set / _status / _subagent
 *                                        （dev_mode_subagent 会派生 agent）
 *
 * ⚠️ 硬证据：2026-08-29 的一次 **qq-chat-v2 仿真会话**记录下来的工具清单里，
 * 除了 MCP 工具就只有 `ask_user_question`、`todo_write`、`dev_mode_*`、
 * `dsh_rollback`、`dsh_snapshot`、`incident_resolved`。也就是说
 * **`dsh_snapshot`/`dsh_rollback` 真的进过仿真会话的 schema**——本名单初版漏了它们。
 *
 * 2026-09-29 针对 DSH 0.2.0-rc.2 重新对账（同样不是逐个打补丁，而是拿安装包重扫）。
 * 对账工具：`node scripts/scan-dsh-tool-names.mjs`（可重复运行；它从已安装的
 * `@deepseek-ai/dsh-*` 里抽真实工具名，与本名单求双向差）。
 * 该轮结论：**旧名字全部还在**（0 个假名，0.1.7 那次替换后没有再次改名），
 * 但 0.2.0 的包里多出 13 个「危险语义」名字是名单没覆盖的，逐条判定如下：
 *
 *   ① 真的会进仿真会话、必须隐藏的（它们在**全局层**，所有 preset 都继承）：
 *      · `list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource`
 *        —— `dsh-base` 的 `mcp-resources` 行**默认启用**（cordis.patch.yml 里没有
 *        disabled），所以每个 QQ 会话都会继承这三个工具。`read_mcp_resource` 的
 *        `server` 参数可以指向**任意已配置的 MCP server**：用户一旦挂了
 *        filesystem 之类的能力型 MCP，QQ 群就通过它拿到了文件读取权。
 *        这正是 L7 要挡的那类越权路径，因此必须从 schema 里隐藏。
 *   ② 会派生 agent / 执行外部代码（当前只在 DSH 自带 preset 里挂载，QQ preset 不挂；
 *      列进来是**回归网**：别的 composition 一旦把它们推进全局层就被挡住）：
 *      · `subagent_codex` / `subagent_claude_code`（Codex / Claude Code 子智能体）
 *      · `spawn_teammate` / `team_task_create|get|list|update`（实验性 Team 模式）
 *   ③ 等于把插件装载权交出去 ⇒ 任意代码执行：
 *      · `plugin_manager`（安装/卸载/启停插件，内部会 spawn pnpm）
 *   ④ 无人值守的自我调度（`dsh-schedule`，0.2.0 起是可选 bundle）：
 *      · `schedule_create` / `schedule_list` / `schedule_update` / `schedule_delete`
 *
 * 2026-10-22 针对 DSH 0.2.1-rc.2 重新对账（`node scripts/scan-dsh-tool-names.mjs`）。
 * DSH 这轮把不少能力从「实验组合包」转正，工具面因此变了三处：
 *   ① **新增一个真的会进仿真会话的全局工具**：`dsh-base` 现在默认挂
 *      `working-directory` + `tool-working-directory` 两行，于是 `working_directory`
 *      和 `list_mcp_resources` 一样属于**全局层继承**——QQ 会话一定拿得到，
 *      必须从 schema 隐藏（`state/tool-restrict.log` 的 known global tools 实测可见）。
 *   ② 新增终端能力 `dsh-tool-terminal`（`terminal_open|send|read|signal|close|list`）：
 *      终端 = 直接 shell，是本名单第一优先级要挡的东西；当前 composition 没启用，
 *      列进来是**回归网**（一旦被插件市场/组合包装上就自动挡）。
 *   ③ 新增会话历史检索 `dsh-tool-session-query`
 *      （`session_search|trace`、`session_event_read|search|trace`）：
 *      能跨会话读事件正文 ⇒ 等于把别的聊天记录递给 QQ 群，列进来。
 *   另有两个「装载权」入口同轮补上：`plugin_market`（插件市场，等价 plugin_manager）
 *   与 `create_worktree`（写盘 + 起 git 进程）、`wait_agent`（team 家族同族）。
 *
 * ⚠️ 0.2.1 把 Codex / Claude Code 从内置 preset 改成**按需安装的可选插件**，
 *    因此 `subagent_codex` / `subagent_claude_code` 在默认安装里**不存在**——
 *    restrict 对它们必然抛错。但用户一旦装上那两个组合包，名字就会回到全局层，
 *    所以仍然保留为**可选项名单**（{@link OPTIONAL_BUNDLE_TOOL_NAMES}）而不是删掉；
 *    扫描器/测试把这一组排除在「拼错假名」判定之外，其余名字照旧逐个对账。
 */
const LOCAL_EXECUTION_TOOLS = [
  // shell / 进程
  'pwsh', 'bash',
  // 文件读写
  'read', 'read_image', 'write', 'edit', 'str_replace_editor',
  // 文件检索
  'glob', 'grep',
  // 自带运行时（Python/Node/pnpm 的绝对路径）⇒ 等于把"跑代码"递给模型
  'load_workspace_dependencies',
  // 派生 agent 与编排（都能间接拿到 shell）
  'subagent', 'subagent_fork', 'list_subagent_models',
  'send_message', 'interrupt_agent', 'list_agents',
  'workflow', 'ralph',
  // 插件/cordis 运行期检查：能读宿主状态（0.1.7 起只有这两个名字）
  'cordis_inspect_list', 'cordis_inspect_query',
  // 本机文件 + 进程：plugin-guard 会改写配置并 spawn pnpm
  // 本地偏差（2026-10-02，本部署）：本机未安装 dsh-plugin-guard，这三个名字在已安装包里
  // 不存在 ⇒ restrict 抛错被吞（静默 no-op），verify:adaptation / test-preset-local-tools 会红。
  // 已从名单移除；**若日后挂上 dsh-plugin-guard，请把下面这行加回来**：
  // 'dsh_snapshot', 'dsh_rollback', 'incident_resolved',
  // 会话/交付/任务面
  // 注意：`todo_write` 与 `ask_user_question` **故意不在**此名单——它们是下面
  // SAFE_EXACT 允许的无害模型侧工具，两边不能自相矛盾。
  'job_list', 'job_output', 'job_kill', 'skill', 'present',
  'get_goal', 'create_goal', 'update_goal',
  // 0.2.0 新增对账（见上方长注释的 4 类判定）：
  //   ① 全局层默认启用 ⇒ 真的会进仿真会话
  'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource',
  //   ② 派生 agent / 执行外部代码
  'spawn_teammate', 'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update',
  //   ③ 插件装载权（= 任意代码执行）
  'plugin_manager',
  //   ④ 无人值守的自我调度
  'schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete',
  // 0.2.1 新增对账（2026-10-22，见上方长注释）：
  //   ① dsh-base 默认启用 ⇒ 全局层继承
  'working_directory',
  //   ② 终端（= shell）
  'terminal_open', 'terminal_send', 'terminal_read', 'terminal_signal', 'terminal_close', 'terminal_list',
  //   ③ 会话历史检索（能读别的会话的事件正文）
  'session_search', 'session_trace', 'session_event_read', 'session_event_search', 'session_event_trace',
  //   ④ 装载权 / 写盘起进程
  'plugin_market', 'create_worktree',
  //   ⑤ team 家族同族补齐
  'wait_agent',
  // 已装但当前未进 bundles 的插件（一旦加回就是新口子）
  'dev_mode_set', 'dev_mode_status', 'dev_mode_subagent',
]

/**
 * 0.2.1 起改为「按需安装」的可选能力包里才会注册的全局工具名。
 *
 * 它们默认**不存在**于安装树里（0.2.0 时写在 `dsh-web-app/presets/*.patch.yml`），
 * `tools.restrict()` 对它们必然抛错——守卫逐个 try/catch 正是为这种名字设计的。
 * 保留的收益：用户装上 Codex / Claude Code 组合包后，名字回到全局层时**立刻**被挡，
 * 不必等下一次对账。
 *
 * 扫描器与测试用这一组把「可选项」和「拼错的假名」区分开：只有不在本组、又扫不到的
 * 名字才判成假名。
 */
export const OPTIONAL_BUNDLE_TOOL_NAMES = Object.freeze([
  'subagent_codex',
  'subagent_claude_code',
])

const KNOWN_DANGEROUS_GLOBAL_TOOLS = [
  // 本地执行面（见上）
  ...LOCAL_EXECUTION_TOOLS,
  // 按需安装的可选能力包（0.2.1 起默认不存在；装上就要挡）
  ...OPTIONAL_BUNDLE_TOOL_NAMES,
  // dsh-super-injector / 开发注入器（0.1.7-rc.2 实测注册的全局工具）
  // 说明：这些名字是**运行时**才出现的（注入即注册、卸载即消失），所以只能尽力 restrict；
  // 真正的边界是下面的执行期白名单。
  'dev_build_plugin',
  'dev_clear_routes',
  'dev_fix_patch',
  'dev_heal_links',
  'dev_inject_plugin',
  'dev_injected_list',
  'dev_install_package',
  'dev_plugin_status',
  'dev_release_plugin',
  'dev_reload_package',
  'dev_scaffold_plugin',
  'dev_self_test',
  'dev_stage_add',
  'dev_stage_call',
  'dev_stage_demote',
  'dev_stage_list',
  'dev_stage_promote',
  'dev_uninject_plugin',
  // 第三方搜索插件 dsh-free-search（2026-10-03 装入 web profile，v0.7.1）注册的
  // 全局工具。它们由宿主层注册，绕过 src/mcp-web-search-safe.js 的 SSRF 加固
  // 直接对外发 HTTP ⇒ 仿真会话必须在注册期就隐藏（执行期白名单仍兜底）。
  'advanced_search',
  'platform_search',
  'free_search_test',
  'multi_search',
]

// 供 test-preset-local-tools.mjs 导入并与 DSH 真实工具名对账，避免两份名单漂移。
export const RESTRICTED_TOOL_NAMES = Object.freeze([...KNOWN_DANGEROUS_GLOBAL_TOOLS])

// 执行期白名单：不在这些范围内的工具一律拒绝。
// 前缀覆盖 DSH MCP client 暴露的命名空间工具。
const SAFE_PREFIXES = [
  'mcp__snowluma__',
  'mcp__snowluma-host__',
  'mcp__web-search-safe__',
  // B 站視頻摘要（qq-bridge-addons，2026-10-22）：只讀，跑本機 yt-dlp 解析公開視頻
  'mcp__bili-digest__',
  // B站旁挂（2026-10-28）：选题/看视频只读，评论走草稿队列，发出需主人点头
  'mcp__bili-local__',
  'mcp__voice-tts__',
]

// 无害模型侧工具：ask_user_question 用于把问题转给管理员/用户，
// todo_write 仅维护任务列表。若后续 preset 不再挂载这些工具，保留无害。
//
// 本地偏差（2026-10-03 放行、2026-10-08 收回 compress，本部署）：ACP（billion-context）的
// 上下文管理工具里，decompress / search_context / acp_status / acp_cache 继续放行，
// 只有 compress 重回收紧口径（代码见 DISABLED_WITH_REASON，证据见本段末尾的 2026-10-08 更正）。
// 理由（逐条核对过，不是"顺手加"）：
//   1) 它们由 billion-context 的 **DSH 原生插件**在**全局层**注册：
//      profile `web` 的 `package.json` → `dsh.profile.bundles` 含 `billion-context`；
//      插件源码 `node_modules/billion-context/dist/agent/dsh-native.js` 有
//      `inject=["tools","commands","agents"]` 与 `ctx.tools.register(toolDefinition(tool))`，
//      工具集来自 `fetchManifest(base,"anthropic")`（⇒ 名字随上游版本变化，不要写进 restrict
//      的 deny 名单：那份名单是靠 `scripts/scan-dsh-tool-names.mjs` 对账"真名"的，
//      静态扫描只覆盖 `@deepseek-ai/dsh-*`，抓不到这些运行时工具名，加了会被判成假名）。
//      因为注册在全局层，每个 QQ 仿真会话的 schema 里本来就有它们。
//   2) 它们**没有** shell / 文件 / 进程 / 派生 agent 能力，只对本会话的历史做折叠与检索
//      ——正是本名单所说的"无害模型侧工具"（对模型能力面而言等价于 todo_write）。
//   3) ACP 会把"compression philosophy"注入 system prompt，等于要求模型在上下文变长时
//      自行压缩；工具却被守卫挡住 = 让模型做一件做不到的事。实测 2026-10-03 已累积
//      **32 次拒绝且全部是 `compress`**（group 会话 25 次、另一个会话 6 次、1 次），
//      每次都白费一轮对话，模型偶尔还会在群里把这次失败念出来。
//   4) 放行顺带省钱：上下文更早折叠 ⇒ 后续 cacheMiss（¥1/M）更少。
//      ⚠️ 2026-10-08 更正：这一条被实测推翻，所以 compress 收回了，见本段末尾。
// 注意：**自动压缩不依赖这些工具**（ACP 在 API 层自动折叠，QQ 会话日志里可见
// `{"type":"compaction/end", ...}` 事件），所以这里放行的只是"模型手动压/取回"的能力，
// 不是"能不能压缩"的前提；哪天真出问题，把这几行删掉即可回到严格口径。
//
// 2026-10-08 更正（收回 compress 的实测依据）：
//   ① 每一次手动 compress 都会改写前綴 ⇒ 紧随其后的步骤整段重读：10-08 当天 5 次
//      compress 各自带来 27K~37K tokens 的 cacheMiss（约 ¥0.027~0.037/次），合计约
//      ¥0.15，占当天花费（¥1.73）近一成；而它省下的是 cacheHit（¥0.02/M）——
//      一次前綴重写与同一段内容重读之间差 50 倍，这笔账算不过来。
//   ② 6 个会话累计 52 次调用里，compress 占了 52 次中的绝大多数（同一批会话里
//      decompress 0 次、search_context 0 次、acp_status 7 次、acp_cache 1 次），
//      即放行的 5 个上下文管理工具里只有它在被高频使用 ⇒ 只收回它一个。
//   ③ 自动折叠不依赖它：同一批会话日志里有 compaction/start 32 次、compaction/end
//      32 次（ACP 在 API 层自动折叠），少了 compress 不会让上下文无限膨胀。
//   ④ 拒绝的成本远低于放行：一次被拒的调用只是一个 100~300 token 的步骤（约
//      ¥0.001），比放行后 ¥0.03 的前綴重写便宜一个数量级；而且下面的
//      DISABLED_WITH_REASON 会给模型一句明确解释，避免 2026-10-03 那种
//      「被拒了但不知道自己错在哪」的反复尝试（当时累积 32 次拒绝）。
//   要再放开：把 compress 加回 SAFE_EXACT，并从 DISABLED_WITH_REASON 删掉即可。
const SAFE_EXACT = new Set([
  'ask_user_question',
  'todo_write',
  // 跨会话共享记忆（dsh-memory 1.0.0，2026-10-16 放行）：这两个工具只在记忆目录内读写
  // MEMORY.md / CONFLICTS.md / runs.jsonl，没有 shell、exec、subagent 能力。
  'memory_read', 'memory_save',
  // 原生联网搜索/抓取（2026-10-17 切到 deepseek-search-tools provider；只读，无执行面）
  'web_search', 'web_fetch',
  // ACP / billion-context 上下文管理工具（见上方本地偏差说明与 2026-10-08 更正）：
  // 2026-10-09：compress 加回本集合（当天凌晨实测：把 compress 关掉后 bili 的折叠完全停摆
  // ——bili 只发提醒，动手的是模型的 compress 呼叫；10-09 呼叫 11 次全被拒、fold 0 笔）。
  'compress',
  'decompress',
  'search_context',
])

// 2026-10-24：生图工具不再进 SAFE_EXACT，改为按会话工作区隔离。
// 用户要求：dsh-imagegen 只给 dsh-im 自己的官方 QQ bot 用，qq-bridge（SnowLuma）不许用。
// 两个 bot 都跑 qq-chat-v2 preset，唯一可靠的区分是会话的 header.cwd：
// dsh-im 的会话落在它的工作区（/root/.dsh/integrations/dsh-qq/workspaces.json 里配置，
// 默认 /root/.dsh/im），桥接会话落在 /root/qq-bridge/state/agents/<sessionId>。
// 所以这里不写死路径：读 workspaces.json，按 mtime 缓存，任何一个工作区内的会话才放行。
const DSH_IM_ONLY_TOOLS = new Set([
  'generate_image',
  'edit_image',
  'get_image_generation_task',
  // dsh-im 的出站附件工具：把生成结果登记到当前回合的 IM 投递队列（桥接会话没有 consumer）
  'dsh_im_return_file',
])

const DSH_IM_WORKSPACES_FILE = process.env.QQ_DSH_IM_WORKSPACES
  || path.join(process.env.HOME || '/root', '.dsh/integrations/dsh-qq/workspaces.json')

let dshImWorkspaceCache = { stamp: -1, roots: [] }

function dshImWorkspaceRoots() {
  try {
    const stamp = fs.statSync(DSH_IM_WORKSPACES_FILE).mtimeMs
    if (dshImWorkspaceCache.stamp === stamp) return dshImWorkspaceCache.roots
    const parsed = JSON.parse(fs.readFileSync(DSH_IM_WORKSPACES_FILE, 'utf8'))
    const roots = Object.values(parsed?.workspaces ?? {})
      .filter((value) => typeof value === 'string' && value.startsWith('/'))
      .map((value) => path.resolve(value))
    dshImWorkspaceCache = { stamp, roots }
    return roots
  } catch {
    return dshImWorkspaceCache.roots
  }
}

function sessionCwdOf(exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  return typeof cwd === 'string' ? cwd : ''
}

function isDshImSession(exec) {
  const cwd = sessionCwdOf(exec)
  if (!cwd) return false
  const resolved = path.resolve(cwd)
  return dshImWorkspaceRoots().some((root) => resolved === root || resolved.startsWith(root + path.sep))
}

// 2026-10-08：曾收回 compress（理由：泛泛一句「不在白名单内」会让模型反复重试）。
// 2026-10-09：**重新开放**。10-08 19:58 收回后实测：bili 自己不会折叠，它只发 T1 提醒，
// 真正折叠要模型叫 compress——最后一次成功呼叫 2026-10-08T10:12:36Z 与 bili 最后一笔
// fold（b79）同秒，而 10-09 呼叫 11 次全被拒、fold 0 笔、上下文只涨不缩。
// 保留本表结构（日后若要再关某个工具，往这里加即可），但不再拦截 compress。
const DISABLED_WITH_REASON = new Map([
  // 目前不拦任何工具。
])

// ── 诊断落盘：restrict 失败时到底为什么 ────────────────────────────────────
//
// 为什么必须落盘（2026-10-18 实测）：重启之后新建的 QQ 会话 schema 里，
// `dev_*` **仍然是 18 个**——说明 `ctx.tools.restrict({deny})` 根本没生效，
// 而失败被下面的 per-name try/catch 吞掉了。DSH 的 stderr 不落日志文件（只有启动失败
// 才会写 ~/.dsh/logs），所以「为什么失败」在现网完全不可观测。
//
// 这里把失败原因写到 <repo>/state/tool-restrict.log（有界、只写最近 20 行），
// 并把失败的名字在 3 秒后重试一次：如果只是「注入器比 preset 晚注册」的时序问题，
// 重试就能把工具真正藏掉；如果重试也失败，日志里会留下 DSH 的原始报错，
// 下次排查不用再猜。
const DIAG_FILE = (() => {
  // 测试可用 QQ_TOOL_RESTRICT_LOG 改到临时文件，避免污染真实 state/
  if (process.env.QQ_TOOL_RESTRICT_LOG) return path.resolve(process.env.QQ_TOOL_RESTRICT_LOG)
  try {
    // 本文件位于 <repo>/plugins/qq-agent-presets/，往上两层就是仓库根
    return fileURLToPath(new URL('../../state/tool-restrict.log', import.meta.url))
  } catch { return '' }
})()

function writeDiagnostics(lines) {
  if (!DIAG_FILE || !lines.length) return
  // 单行截断：DSH 的报错里会把**整份** known global tools 清单拼进去（实测单行 2KB+），
  // 不截就等于把日志变成噪声。保留开头足够定位的信息即可。
  const trim = (line) => (line.length > 240 ? `${line.slice(0, 240)}…` : line)
  try {
    const previous = (() => {
      try { return fs.readFileSync(DIAG_FILE, 'utf8').split('\n').filter(Boolean) } catch { return [] }
    })()
    // 有界：只保留最近 20 条（每次 agent 创建都会写一轮，别让文件无限长）
    const next = [...previous, ...lines.map(trim)].slice(-20)
    fs.mkdirSync(path.dirname(DIAG_FILE), { recursive: true })
    fs.writeFileSync(DIAG_FILE, next.join('\n') + '\n', 'utf8')
  } catch {}
}

export function apply(ctx) {
  // 1) 把已知危险全局工具从 schema 隐藏（restrict 只影响继承的全局层，
  //    不会误删 preset 自己注册的 scoped 工具）。
  // 逐个 restrict：当前 DSH 版本不存在的工具名会单独抛错并跳过，
  // 不会导致整批限制失败（restrict 的 unknown 校验是整批原子性的）。
  //
  // 口径（2026-09-27 实测 web profile 的全局层）：实际存在的全局工具只有
  // `dev_*`（注入器）与三个 MCP 命名空间的工具；`read`/`pwsh`/`subagent` 这类
  // 是**各 preset 行自己注册的 scoped 工具**，在 QQ preset 里根本没挂载，
  // 因此本名单主要防的是"别的 composition 把它们注册进全局层"这种回归，
  // 以及 MCP 之外的宿主工具（plugin-guard / cordis 检查工具等）。
  const stamp = new Date().toISOString()
  // 两类失败必须分开（2026-10-26 修）：
  //   absent —— tools.restrict() 报 "unknown global tool"，意思是**这个安装里没有这个工具名**。
  //             本名单是"防回归"名单，LOCAL_EXECUTION_TOOLS 里绝大多数（pwsh/bash/read/subagent…）
  //             是各 preset 行自己注册的 scoped 工具，在 QQ preset 里本来就没挂载 ⇒ 不存在是常态。
  //   broken —— 名字存在但 restrict 没生效，这才是真问题，必须报出来。
  // 以前把两类混在一条 console.error 里，每次启动刷一条 3KB 的"报错"，79/83 全是常态，
  // 真正的故障反而淹在里面看不见。
  const absent = []
  const broken = []
  const reasonOf = (error) => String(error?.message ?? error)
  const isUnknownName = (message) => message.includes('unknown global tool')
  const attempt = (names) => {
    let ok = 0
    for (const name of names) {
      try {
        ctx.tools.restrict({ deny: [name] })
        ok += 1
      } catch (error) {
        const message = reasonOf(error)
        if (isUnknownName(message)) absent.push(name)
        else broken.push({ name, message })
      }
    }
    return ok
  }

  const firstOk = attempt(KNOWN_DANGEROUS_GLOBAL_TOOLS)
  const firstAbsent = absent.slice()
  const firstBroken = broken.slice()

  console.log(
    `[qq-tool-restrict] ${stamp} 全局层 restrict：隐藏 ${firstOk} 个 / 本安装不存在 ${firstAbsent.length} 个 / 真失败 ${firstBroken.length} 个`
  )

  if (firstBroken.length > 0) {
    const reasons = [...new Set(firstBroken.map((f) => f.message))]
    console.error(
      `[qq-tool-restrict] restrict 真失败 ${firstBroken.length}/${KNOWN_DANGEROUS_GLOBAL_TOOLS.length}：${reasons.join(' | ')}`
    )
    writeDiagnostics([
      `${stamp} restrict ok=${firstOk} absent=${firstAbsent.length} broken=${firstBroken.length} 原因: ${reasons.join(' | ')}`,
      `${stamp} 失败样例: ${firstBroken.slice(0, 3).map((f) => f.name).join(', ')}`,
    ])
  }

  // 时序兜底：注入器的工具可能在 preset apply 之后才注册进全局层。
  // 所以重试的是第 1 轮"不存在"的那批（晚注册后会变成存在），且只在**真补到东西**时打日志。
  if (firstAbsent.length > 0) {
    const timer = setTimeout(() => {
      let ok = 0
      const stillAbsent = []
      for (const name of firstAbsent) {
        try {
          ctx.tools.restrict({ deny: [name] })
          ok += 1
        } catch (error) {
          const message = reasonOf(error)
          if (isUnknownName(message)) stillAbsent.push(name)
          else writeDiagnostics([`${new Date().toISOString()} 延迟重试真失败 ${name}: ${message}`])
        }
      }
      if (ok > 0) {
        console.error(`[qq-tool-restrict] 延迟重试补藏成功 ${ok} 个（晚注册的全局工具）`)
        writeDiagnostics([`${new Date().toISOString()} 延迟重试 ok=${ok} 仍不存在=${stillAbsent.length}`])
      }
    }, 3000)
    timer?.unref?.()
  }

  // 2) 执行期白名单：任何不在允许范围内的工具调用都会被拒绝。
  ctx.tools.guard((exec) => {
    const name = exec?.name
    if (typeof name !== 'string' || name.length === 0) return '工具名无效，已拒绝'
    const disabledReason = DISABLED_WITH_REASON.get(name)
    if (disabledReason) return disabledReason
    if (DSH_IM_ONLY_TOOLS.has(name)) {
      if (isDshImSession(exec)) return
      return `工具 "${name}" 只对 dsh-im 官方 QQ bot 会话开放（当前会话工作区：${sessionCwdOf(exec) || '未知'}），已拒绝`
    }
    if (SAFE_EXACT.has(name)) return
    if (SAFE_PREFIXES.some((prefix) => name.startsWith(prefix))) return
    return `工具 "${name}" 不在 QQ 桥接白名单内，已拒绝（仅允许 QQ MCP 工具与无害模型侧工具）`
  })
}
