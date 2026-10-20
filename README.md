# DSH Tool manager

A standalone Cordis plugin for DeepSeek Harness 0.2.1-rc.2. No core patches and no modifications to other plugins.

Open **Settings → Tool manager**. The catalog uses compact tool rows in collapsible plugin folders and nested custom folders. Search and Save remain at the top while scrolling. Tool metadata, folder ordering, and embedding preferences stay collapsed until opened; built-in folders use readable labels with the full package name in the tooltip. Edit each tool's availability, summary, folder path, plugin attribution, order and associated DSH skill names; save the changes. Folder order is editable inside each expanded folder. Check a plugin or nested folder to select all descendants across every page, or check individual tools. Apply availability to the selection, or use a folder’s own availability menu. Folder actions include descendants hidden by the current search filter; “Select all matching tools” follows that filter. Discovery controls cannot be disabled. Bulk changes remain drafts until you click Save changes. Lower order values appear first. The catalog is paged at 50 tools per page and can be filtered by name, description or folder.

A stale plugin connection token renews through DSH’s public browser-authentication service and retries once. No new account permissions or browser credentials are granted.

Catalog requests read the global registry once and reuse previously inspected agent metadata. They do not probe restrictions, replay inactive session logs, or wait for package-source scans. Provenance refresh runs in the background; unchanged agent steps reuse their existing policy. Requests time out after 15 seconds and show a retry action instead of an endless loading message.

## Model workflow

- `tool_manager_search(task="what I need to accomplish")` searches compact tool descriptions without exposing full schemas. Omit `task` to browse groups; pass `folder`, `offset`, and `limit` for browsing. Search results also include matching skill summaries, when the skill service is available.
- `tool_manager_select(names=[...], skills=[...])` opens 1–7 tools per call, configurable in settings. It loads explicit tool-to-skill mappings and additional selected skills through the public DSH skill service, respecting model-invocation policy. No selected tool action is automatically executed.
- `tool_manager_close(names=[...])` queues closure. Tools remain callable until a successful `compaction/end`. Failed compaction changes nothing. Queuing closure keeps this plugin’s system-prompt text and callable schemas identical; the close acknowledgment is logged as the normal tool result. Reselecting a queued tool cancels closure.

Selection receipts are normal tool-result presentation metadata. A pure session projection reconstructs selection from committed Native/PTC tool results and successful compaction events. Prompt text describes current windows and how to close them. Ordinary tool results and skill bodies already in history remain until DSH compacts that history; this plugin never rewrites or prunes it.

## Visibility

Choose **Stock tools + search for extras** in the Baseline selector and save to retain the shipped standard tool set while making unconfigured plugin tools searchable on demand. This also covers future registered extras. Explicit per-tool choices take precedence, including an explicit Provider default override. The compatibility baseline remains Provider defaults until the user selects the stock baseline.

`lib/policy.js` records the standard tool names verified against DSH 0.2.1-rc.2: shell (Bash or PowerShell), file read/image/write/edit/search, working directory, jobs, schedules, skills, goals, plan exit, subagents/workflows, user questions, todos, web search/fetch, and presentation. New DSH versions may change that set; the plugin does not classify arbitrary installed packages as stock just because their name looks official.


Tools start at **Provider default**, preserving their provider’s original availability. This also applies to tools registered later. Opt in to **Always available**, **Search and select**, or **Disabled** per tool or folder; discovery controls always remain available. “Always available” removes only this manager’s discovery restriction, and cannot override another provider’s policy. Version 1 settings migrate to provider defaults for unconfigured tools while preserving explicit overrides. Restrictions apply independently per agent, intersect with other policies, and never grant permissions another policy withheld. Explicit disabling also uses a monotonic execution guard.

DSH exempts a scope's own registrations and reserved transports from its restriction API. Such tools are labelled **Scope-owned: schema cannot be hidden**; their owners must cooperate for schema removal. Permission and execution policy is preserved, and explicitly disabled tools are denied. Lazy tools only appear once their provider registers them. This plugin cannot enumerate hidden, unregistered backends.

Tool ownership is not an authoritative field on DSH's public tool definitions. The plugin infers unique matches from installed package source literals, labels them as inferred, and provides explicit owner/group overrides. Unmatched tools are labelled Unattributed. Ambiguous built-in tools are grouped under DSH built-in tools, with their candidate providers shown. Built-in providers in pnpm’s virtual store are scanned as well as profile-installed plugins. Discovery uses the calling agent's currently permitted registry view; it does not bypass another plugin's restrictions.

Catalog summaries and ordering are editable. These changes affect discovery presentation and search; they deliberately do not rewrite another provider's callable schema, parameter definitions, prompt sections, or tool names.

## Skills and basic lookups

Put personal skills in `$DSH_HOME/skills/<skill-name>/SKILL.md` (normally `~/.dsh/skills/`). DSH's filesystem skill provider discovers them. Tool manager searches model-invocable skill names and descriptions with BM25; it does not index the full skill bodies or require embeddings for skill search. Use descriptive YAML `name` and `description` fields. The stock `skill` tool loads full instructions on demand.

To expose only basic lookups beyond stock, pin `web_search` and `knowledge_search` as Always available and leave the other extra tools on Search and select. Knowledge's administration tools stay in their plugin folder. Browser tools appear when a browser provider registers them; no browser provider is installed automatically. Prompt guidance encourages searching the actual installed catalog for useful tools and skills, without claiming an unlimited installed tool set.

## Optional description embeddings

BM25 is built in and requires no model. The semantic index is a separate module, configured under **Tool-description embeddings and semantic search**. Supply an OpenAI-compatible API root (usually ending in `/v1`), model name, and optional key; enable semantic search, then **Save and build index**. Do not assume the sample local endpoint is running: it is only an editable default, and semantic search starts disabled.

Only metadata (name, plugin, folder and summary) is embedded during index builds. Enabled semantic search also sends the task query to that provider. A loopback local endpoint keeps the work local; remote endpoints must use HTTPS. No model, runtime, or weights are silently downloaded. The plugin does not depend on the Knowledge plugin, so they can be maintained or removed independently.

The index persists atomically and reuses unchanged descriptions. A changed endpoint/model or changed tool description invalidates relevant entries. BM25 and semantic rankings use reciprocal-rank fusion. Semantic errors or a missing/stale index produce a visible BM25 fallback. Index results are filtered against the requesting agent's allowed catalog before ranking; an index built for one scope cannot reveal another scope's tools.

## Context and cache limits

Search returns seven matches by default, not the entire catalog. Selection opens the chosen schemas; it does not execute their actions. Stock tools plus the three discovery controls remain available under the stock baseline. Existing provider prompt sections, skill summaries, and already committed search results are separate from tool-schema visibility.

Public hooks do not let this plugin erase a committed search result immediately after selection, or guarantee that adding a schema only invalidates the tail of an inference engine’s KV cache. Model adapters serialize callable schemas on requests, and prefix reuse depends on their ordering and the inference backend. An unsuccessful tool call does not currently move or duplicate a schema at the front of history. Queued closure waits for successful compaction; malformed calls follow DSH’s normal error handling.

## Storage and modules

`$DSH_HOME/dsh-tool-manager/` (default `~/.dsh/dsh-tool-manager/`) holds `settings.json` and `tool-embeddings.json`, written with owner-only permissions. The settings may contain the configured embedding API key. The tool context state itself comes from the existing DSH session log.

- `lib/policy.js`: versioned stock-tool baseline.
- `lib/catalog.js`: discovery metadata and best-effort provenance.
- `lib/search.js`: BM25.
- `lib/semantic.js`: embedding transport, persistent index, cosine ranking and fusion.
- `lib/state.js`: pure select/close/compaction state transitions.
- `lib/settings.js`: configuration validation and atomic persistence.
- `index.js`: public Cordis registry, lifecycle, projection, skill and authenticated Web API adapters.
- `client.js`: React settings slot using DSH theme tokens.

## Local development

Install through the official CLI:

```
dsh plugin --profile web add /absolute/path/to/dsh-tool-manager --config.ignore-scripts=true
```

Install development dependencies inside this plugin and run `node --test test/*.test.js`. Syntax-check `index.js` and `client.js`. Reconnect/refresh the browser for Client updates; Host entry replacement may require a coordinated DSH restart. Avoid restarting a harness that is processing another plugin's work.

Tests cover real DSH scoped restrictions and permission intersections, the full search→select→skill→close lifecycle using real DSH tools/session projections, failed/successful compaction, replay, persistent settings, semantic-index reuse and fallback, scope filtering, provider defaults and late registrations, unloading/reloading providers, manager removal, standalone skill discovery, and folder bulk edits across pages that stay in draft until saved. Hardware embedding throughput and visual layout across platforms have not been benchmarked.
