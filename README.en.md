# qq-bridge

[中文](README.md) · [Setup guide](docs/guides/DSH_SETUP.md) · [Issues](https://github.com/Derpyu520/qq-bridge/issues)

A local message bridge that forwards message events and AI replies between the **OneBot v11 interfaces provided by SnowLuma** and [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness).

> [!IMPORTANT]
> **qq-bridge is independently maintained. It is not a SnowLuma subproject and is not affiliated with SnowLuma, DeepSeek, or Tencent / QQ.**
> It communicates through the **OneBot v11 interfaces** exposed by SnowLuma. The bridge and the SnowLuma backend are deployed and maintained independently, without affiliation, partnership, or endorsement. OneBot v11 is a public protocol, not a proprietary SnowLuma protocol.

```text
QQ ↔ SnowLuma ↔ qq-bridge ↔ DeepSeek Harness (127.0.0.1:3080/api) ↔ Model provider
             OneBot v11
```

> ⚠️ **Current release `v0.2.1-r1`, targets DSH 0.2.1-rc.2** (also compatible with 0.2.0-rc.2; verified item by item on both — run `npm run verify:adaptation`). It uses the persistent local signing key to **mint the session Cookie offline**, slash RPC endpoints and the `/api/remote.mux` event stream — a protocol generation introduced in DSH `0.1.2-alpha.1`, incompatible with the older dot-endpoint protocol. Reading the launch token out of the old guard logs has not worked since DSH 0.1.7 (the token is generated per process and never written to disk). Agent presets are `@deepseek-ai/dsh-agent-preset` Cordis rows since DSH 0.1.7 (the `~/.dsh/.agent-presets/` directory mechanism is gone). On **DSH `0.1.1-rc.2` or earlier**, use tag [`v0.1.0`](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.1.0); for **DSH 0.1.5-rc.1** use [`v0.1.5`](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.1.5); for **DSH 0.1.7-rc.2** use [`v0.1.7`](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.1.7).
>
> **r4 highlights**: sticker/animated-emoji pipeline (CDN first, `emoji_id` fallback, multi-address DNS failover), web search now reuses DSH's own DeepSeek search backend (Bing only as fallback), `qq_wait_for_messages` long-polling past the 300 s undici timeout, plus fixes for the mode-switch rollback, permanent "busy" turns, missing self-identity injection and a full-project audit. Details: [Release v0.2.0-r4](https://github.com/Derpyu520/qq-bridge/releases/tag/v0.2.0-r4).
>
> **v0.2.1-r1 highlights**: DSH 0.2.1-rc.2 adaptation. Fixes a **P0** — the `{{cwd}}` prompt variable used by both QQ presets was removed in DSH 0.2.1, so *every* turn failed during system-prompt assembly before the model ran (QQ showed it as "no reply at all"). Also adds the newly global `working_directory` tool plus the terminal / session-query / plugin-market families to the safety guard. Details: [docs/guides/DSH_021_ADAPTATION.md](docs/guides/DSH_021_ADAPTATION.md).
>
> The default branch `main` **is** this version — a plain `git clone` gets it, no branch switching needed.

For the detailed Chinese guide, see **[docs/guides/PROJECT_GUIDE.md](docs/guides/PROJECT_GUIDE.md)**.
The documentation index (one line per doc, with "still current?" notes) is **[docs/README.md](docs/README.md)**;
the repository/folder and script-naming conventions are in **[docs/FOLDER_MAP.md](docs/FOLDER_MAP.md)**.

## Features

| Use case | Capability |
| --- | --- |
| Message bridge | Separate sessions for groups and private chats; text, images, stickers, and quoted replies |
| Chat and simulation | Regular chat (`chat`), two generations of social simulation (`reserved` / `reserved2`), and custom roles |
| Personal assistant | `closed-agent` grants full DSH tools in owner-only private chats; enable with care |
| Local management | Console for modes, allowlists, approvals, logs, and model usage |

## Architecture

```
QQ messages ──► SnowLuma (OneBot v11 WS) ──► qq-bridge ──► DSH Web API (127.0.0.1:3080/api)
                                                    ▲                      │
                                                    └── agent replies / questions / approvals ┘
```

- **QQ side**: `@snowluma/sdk` provides the OneBot v11 WebSocket client.
- **DSH side**: adapted for DSH 0.1.2+ and **re-verified on 0.2.1-rc.2** — session Cookie minted from the persistent local signing key, `/api/<namespace>/<method>` slash RPC, and `/api/remote.mux` + `session/follow` event stream (the pending queue is read from `value.projections[<id>].values.inbox`, with the unary `session/projections` RPC as the primary path). The per-session model is pinned by the bridge via `session.selectModel` from `config.json`'s `dsh.model` (default `deepseek-flash` = DeepSeek-V41-Flash, multimodal).
- **Agent tools**: three bundled MCP servers expose a restricted QQ toolset (`qq_status`, `qq_list_groups`, `qq_get_group_history`, `qq_send_group_message`, `qq_reply`, etc.), a read-only host probe (`snowluma_status` only), and a read-only `web_search` / `web_fetch` pair with SSRF protection.
  ⚠️ **`start_snowluma` / `stop_snowluma` (and `snowluma.allowProcessControl`) were removed in v0.1.5**: SnowLuma EULA §5.4 requires prior written permission to deploy its proprietary native components through automated scripts. This program only probes, never deploys — installing, starting and scanning SnowLuma is always up to you. See [LICENSE](LICENSE) and [RULES.md](RULES.md).
- **Console**: a local web console at `http://127.0.0.1:3100`, organised into ten task-based pages (Overview, Sessions & Approvals, Persona, Social v2, Social v1, Slang, Usage & Cost, Access & Security, Operations, Tool Reference) with cross-page feature search and a **light / dark theme** (one-click toggle in the header; follows the OS preference until you choose), for mode switching, role management, whitelist/admin settings, slang management, memory, stickers and more. The Persona page manages roles (view/edit/rename/duplicate/delete the prompt of each persona), shows and edits both prompt layers separately — the **simulation prompt** built into the preset (tool/behaviour protocol; synced to DSH, restart required) and the **persona prompt** (`roles/*.md`; applied immediately) — and sets the **DSH reasoning effort** (`max` by default, `high`/`low` selectable). The **Usage & Cost** page shows real-time token consumption and its price in CNY, broken down per group/friend and per conversation turn (see [docs/guides/TOKEN_USAGE_CONSOLE.md](docs/guides/TOKEN_USAGE_CONSOLE.md)).

## Quick start

Use **Windows 10 / 11 and Node.js ≥ 22.13**, with these two services running separately:

- **DSH Web**: validation records cover `0.2.0-rc.2` / `0.2.1-rc.2`. See [compatibility](docs/guides/DSH_SETUP.md#兼容范围) for other versions.
- **SnowLuma**: follow the [upstream instructions](https://github.com/SnowLuma/SnowLuma) to install, start, and sign in. Enable its OneBot **WebSocket server** and **HTTP API**.

### 1. Get the project

Run in PowerShell:

```powershell
git clone https://github.com/ansellchen-boop/qq-bridge.git
cd qq-bridge
npm install
Copy-Item config.example.json config.json
```

`main` is the release branch; `dev` is for development and testing.

`npm install` also patches the `@snowluma/sdk` ESM packaging bug through `scripts/patch-snowluma-sdk.mjs` (postinstall).

### 2. Configure

Edit `config.json` and check at least these fields:

| Field | Value |
| --- | --- |
| `dsh.baseUrl` | DSH Web address, default `http://127.0.0.1:3080`; select a provider and model available in DSH |
| `snowluma.wsUrl` / `httpUrl` | OneBot WebSocket / HTTP addresses, for example `ws://127.0.0.1:3001` / `http://127.0.0.1:3000`; keep the ports separate |
| `snowluma.accessToken` / `homeDir` | Your token and SnowLuma installation directory; when HTTP and WS use different tokens, the bridge must be able to discover both from that directory |
| `ownerQQ` | Your administrator QQ ID |
| `allow.private` / `allow.groups` | Allowed QQ IDs / group IDs; empty allowlists accept no conversations by default |

When running on the same machine, normally leave `dsh.authToken` empty so the bridge authenticates using local DSH credentials. See the [setup guide](docs/guides/DSH_SETUP.md) for details and troubleshooting.

### 3. Install DSH plugins

```powershell
node scripts/setup-dsh.mjs
```

This installs the chat presets and MCP tools into DSH. **It is required for a fresh installation.** Restart DSH afterwards. For profiles other than `web`, see the [setup guide](docs/guides/DSH_SETUP.md#安装步骤).

### 4. Start and test

```powershell
npm start
```

Open the [local console](http://127.0.0.1:3100) and sign in with the token printed at startup. Automatically generated tokens are stored in `state/console-token`. New installations default to second-generation simulation (`reserved2`), which speaks selectively; switch to `chat` for an initial message test from an allowed conversation.

On Windows, `start.bat` also runs the bridge with automatic restart. Closing its window stops it.

## DSH Setup on Another Device

The bridge and console can run without extra DSH setup, but the two DSH chat presets (`qq-chat` and `qq-chat-v2`) and the MCP servers must be installed into DSH once per machine:

```bash
node scripts/setup-dsh.mjs
```

This installs:

- the `qq-agent-presets` bundle, which generates the two `@deepseek-ai/dsh-agent-preset` rows (`qq-chat`, `qq-chat-v2`) plus the shared `qq-tool-restrict` safety guard
- MCP entries in `~/.dsh/profiles/web/cordis.patch.yml`
- `qq-mode-console` and `qq-agent-presets` in the profile `package.json` (`bundles` + `link:` dependencies)
- Default DSH mode set to `reserved2` (second-generation simulation), with a local `state/mode.json` fallback

Then restart DSH. See [docs/guides/DSH_SETUP.md](docs/guides/DSH_SETUP.md) for details.

## Security Notes

- `config.json` and `state/` are **never committed**; the repository only ships `config.example.json`. Both are ACL-hardened to the owner / SYSTEM / Administrators (`npm run harden-acl`).
- MCP send tools enforce whitelist checks and reject CQ-code injection.
- Local paths, credentials, tokens and other sensitive patterns are filtered by the audit layer.
- Simulation sessions get **no local execution tools at all**: the preset's `qq-tool-restrict` row hides them from the tool schema at registration time and a runtime allowlist rejects anything outside the QQ MCP namespaces (`npm run scan:tool-names` re-checks that list against the installed DSH).
- The console uses a generated token when none is configured.

## Repository Layout

```
qq-bridge/
  config.example.json   # sanitized config template (real config.json is not in repo)
  docs/
    README.md           # documentation index (one line per doc + "still current?" notes)
    FOLDER_MAP.md       # folder layout and scripts/ naming conventions
    guides/             # user/operator facing: PROJECT_GUIDE, DSH_SETUP, VOICE, TOKEN_USAGE_CONSOLE, CONSOLE-UI-TESTING
    design/             # design & planning docs
    research/           # investigation notes
    audits/             # review / optimisation reports
    legacy/             # archived docs that were superseded
  dsh/agent-presets/    # qq-chat / qq-chat-v2 DSH agent preset templates
  plugins/qq-agent-presets  # DSH bundle: generates the qq-chat / qq-chat-v2 preset patch rows + the shared tool guard
  plugins/qq-mode-console  # DSH plugin: exposes the qq-mode settings namespace (host half only; no UI card yet)
  src/                  # bridge core and MCP servers
  public/
    console.html        # local web console
  roles/                # persona cards
  assets/               # images (the intro video ships as a release asset, not in the repo)
  scripts/              # tests and helper scripts
  state/                # runtime data (not in repo)
```

The standalone **voice sender tool** (`voice-cli.mjs`, `voice-gui.mjs`, `public/voice.html`, `发语音.cmd`)
lives in the sibling folder **`../voice-tool/`** — it only needs SnowLuma, and reuses this repo's
`src/voice-core.js` / `src/snowluma-conn.js` as the single shared implementation.

## Testing

`npm run test:audit` runs isolated regression tests without production credentials, DSH, or QQ messages. The detailed audit is in [docs/audits/AUDIT_REPORT_2026-09-20.md](docs/audits/AUDIT_REPORT_2026-09-20.md) (Chinese); the 2026-09-18 one it superseded is archived in [docs/legacy/](docs/legacy/).

After upgrading, legacy QQ session mappings without permission metadata are recreated once. Mode or preset changes also retire the old mapping and recreate the session on the next message; DSH history is retained.

```bash
npm run self-test       # DSH-side link test, no QQ/SnowLuma required
npm run test-md
npm run test-wait
npm run test-vision
npm run test-forward
npm run test-slang
npm run test-stickers
```

## Documentation and development

Most detailed documentation is currently in Chinese.

| Task | Documentation |
| --- | --- |
| Install, upgrade, or troubleshoot | [DSH setup](docs/guides/DSH_SETUP.md) |
| Modes, permissions, and commands | [Usage rules](RULES.md) |
| Model usage and cost estimates | [Usage dashboard](docs/guides/TOKEN_USAGE_CONSOLE.md) |
| Contribute | [Contributing](CONTRIBUTING.md) · [Security baseline](docs/guides/SECURITY_BASELINE.md) |
| Report a vulnerability | [Security policy](SECURITY.md) |
| Find other documentation | [Documentation index](docs/README.md) |

Develop on `dev` and run the offline suite before submitting a PR:

```powershell
npm run test:audit
```

## Usage boundaries and license

- Use only in conversations where participants are informed and use is permitted. Follow platform rules; using an unofficial QQ backend may lead to account restrictions.
- DSH sends chat content to your configured model provider. Automatic slang research is enabled by default and may send extracted keywords to search services. See [NOTICE](NOTICE.md#四数据传输) for data flows and controls.
- Protect `config.json`, `state/`, and console tokens. Keep services accessible only locally.
- The bridge does not implement QQ login or its underlying protocol, or install, bundle, start, or stop the SnowLuma backend. It currently uses client packages including `@snowluma/sdk`; third-party terms apply separately.

The current code is available under [PolyForm Noncommercial 1.0.0](LICENSE) for noncommercial use. Releases up to and including `v0.2.1-r1` retain their original MIT license. See [NOTICE](NOTICE.md) for third-party components, project independence, and usage risks.
- SnowLuma is an independent third-party project and is not affiliated with Tencent/QQ. This project is for learning and technical research only; please follow the relevant terms and the QQ User Agreement.
