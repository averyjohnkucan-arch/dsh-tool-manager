# DSH Tool manager

A standalone Cordis plugin for DeepSeek Harness 0.2.1-rc.2. It uses public services and hooks without modifying Harness core or other plugins.

## Essentials and global discovery (0.4.0)

Use **Settings → Tool manager → Baseline → Essentials + search for extras**. Fresh installs use this baseline; upgrades preserve saved settings and per-tool overrides. On Linux with the usual providers this exposes 15 permanent tools: `bash`, `read`, `write`, `edit`, `glob`, `grep`, `read_image`, `working_directory`, `ask_user_question`, `web_search`, `web_fetch`, `knowledge_search`, `knowledge_read_document`, `skill`, and `browse_tools`. Windows can supply `pwsh` instead of Bash. Missing providers are not installed automatically, and host-owned schemas can remain visible because of DSH scope rules.

Fast discovery always searches every registered, permitted tool and every model-invocable skill, including already-visible capabilities. Legacy automatic-suggestion flags do not restrict an explicit search. Skill discovery waits up to 15 seconds and reports an incomplete scan instead of silently treating it as zero matches. Search ranks names and descriptions, not full skill bodies.

The model sees one call and a receipt such as **Model chose office_tools, excel-guide**. The internal selector receives a bounded candidate list with reasoning off. Only selected tool schemas and selected skill bodies reach the parent model; candidates remain in audit metadata. Selected tools persist across turns until explicitly retired. Fast-mode schemas offer search/selection and retirement only, with no folder browser. Manual mode remains available as a compatibility option.

A fresh model sees the small essentials set and instructions to search by task when it needs an extra capability or specialist guidance. It does not need to know skill names. Choosing a tool plus a skill also activates the skill loader; choosing the loader itself does not load all skill instructions.

Through public `agent/pre-step` hooks, Tool Manager replaces full skill-catalog text with a short discovery notice. It preserves the stock catalog identity, complete registry, selected skill bodies, and audit events. Existing full catalogs are compacted through public durable session-surface replacement. The agent-created hook installs the window after catalog providers, covering either startup order without editing providers or the harness.

## Fast model-initiated discovery

Enable **Settings → Tool manager → Preferences → Fast tool selection**. New installations enable it by default; existing saved configurations preserve their previous mode until enabled. Automatic retrieval never runs in this mode, even if its legacy switch was saved as enabled. A persistent prompt asks the model to search before technical tasks; casual conversation needs no discovery call.

`browse_tools(action="find", task="brief goal", keywords=["selective", "terms"])` performs two stages inside one visible tool call: local BM25 search, then a short auxiliary selection request through DSH's public LLM service. It uses the conversation's current provider/model with an advertised `off` or `none` reasoning effort, a 512-token cap and a 45-second deadline starting with the first model output. GPU queueing, model loading and prefill do not spend that output deadline. The outer call remains cancellable and bounded at four hours, matching the local media queue budget. Main answer reasoning is unchanged. This is a second model request, not a zero-cost selection, and its latency/cache impact depends on the provider.

When the search task exactly names a callable tool (underscores/hyphens may be spaces), or supplies explicit `names`, it loads that permitted tool directly without a selector request or skill scan. Exact names cannot be redirected to unrelated skills; unavailable names still fail. For a capability query, discovery searches up to 16,000 characters of each registered description and 16,000 characters of input documentation, including capabilities beyond the UI preview. Common singular/plural forms match. Tool and skill rankings are computed separately so a large skill library cannot distort tool scores.

Explicit fast discovery offers at most ten candidates (seven callable-tool slots and three skill slots, with spare slots filled) in at most 10,000 characters. It includes query-relevant description sentences and bounded registered input/action names, not full schemas. The opening identity and negative capability qualifications are retained where they fit. Legacy automatic-suggestion settings do not narrow this internal shortlist. Search goals must preserve input requirements such as first/last frame images versus a structure video; a same-topic instruction skill cannot add unsupported inputs or make an external service available.

The selector can choose only offered names. Duplicate names are deduplicated and excess valid choices are bounded with room for the skill loader. Invalid JSON or invented names get one internal correction attempt; an invalid final response never activates anything. A successful committed receipt opens the selected tools and closes the browser automatically. Candidates remain in `toolManager.selectionTrace` audit metadata, outside the parent conversation; only chosen names, short ready-to-call hints and selected skill instructions reach its context. A ready receipt includes `menuCall` only if the actual registered schema supports it. The model calls that tool directly, never Bash to open a menu. Persistent tools close with `action="close_tools"` at successful compaction.

Bash's model-facing schema explicitly labels **both** `description` and `command` required and includes a complete example. Native argument validation is unchanged. Invalid Bash calls receive correction guidance without executing anything or inventing a command. All these adaptations use public hooks in this plugin only.

If the model does not advertise reasoning off, fast selection refuses instead of silently reasoning; manual `search`/`add`/`close` remains available. Invalid responses, invented names, truncation, provider errors, unexpected reasoning and cancellation never activate tools. No core or other plugin files are changed.

## Compact tool browser

New installations default to **Essentials + search for extras** and **Use one tool browser**. Existing saved baselines and explicit tool settings are preserved. Pin essential tools as Always available; all other unconfigured tools require discovery, including tools registered later. Older Provider defaults and Stock tools baselines remain selectable.

The model uses one controller:

- `browse_tools(action="search", task="what I need to accomplish")` searches compact descriptions. `action="browse"` supports folder, offset and limit. Results contain no parameter schemas. Seven matches and at most 64 folder names are returned by default.
- `action="add", names=[...]` adds useful tools and automatically closes the browser, usually one or two, with a configurable maximum of seven per call. Long instructions load on demand: optional `skills=[...]` loads model-invocable instructions through DSH's public skill service. A skill-only selection opens the stock skill loader.
- Tools persist by default. For a single operation, add with `use_once=true`, or set **Edit details → Selection lifetime → Use once**. Only a committed successful execution retires a use-once selection; errors and malformed calls leave it open for correction. `use_once=false` overrides a saved use-once lifetime. This option requires Search and select availability; pinned tools keep their configured availability. Provider schemas remain unchanged, and schema removal may invalidate the cached prompt prefix. Task arguments/results are retained. Already-running parallel calls are not cancelled.
- `action="close"` closes the browser. `action="none"` closes it without adding tools. Task tools are blocked while the compact browser remains open. If the model attempts to finish before deciding, the public turn-stopping hook steers it back at most twice, then reports an explicit choice-required error instead of looping indefinitely.
- `action="close_tools", names=[...]` acknowledges queued closure. Selected tools remain available until a successful compaction. Failed compaction preserves them; reselecting cancels queued closure.

After automatic or explicit browser closure, the next pre-step replaces only this plugin's catalog payloads on the model-facing session surface with a receipt such as `No tools selected` or `3 tools selected`. It uses public, durable single-node surface replacements, retaining the original transcript and audit events. User text, task output and selected skill bodies are not rewritten. Full skill-catalog summaries are separately bounded as described above. This is not a literal session rollback or a direct command to prune an inference engine's KV cache. Schema changes and replacements can invalidate the prefix from their insertion positions. Catalog payloads inside mixed PTC transport results cannot be individually rewritten; the direct Native browser path is covered by the replacement tests.

The three older `tool_manager_search`, `tool_manager_select`, and `tool_manager_close` controls remain available in compatibility mode. Compact mode hides them and uses `browse_tools` instead. Only successful committed results update selection and browser state; malformed or failed calls do not grant tools or close the browser.

## Automatic tool_retrieval

Legacy compatibility option: open **Settings → Tool manager → Tool search tuning**. Fast selection always suppresses automatic suggestions. The feature is off until enabled. It suggests five relevant tools before a new user request, using local BM25. Suggestions appear as an expandable `tool_retrieval` notice and do not activate tools. The model must select, decline, or search for more; adding tools automatically closes the browser before task-tool execution.

Tuning controls include maximum results (1–20), minimum relevance, summary length, total injected characters, cooldown, matching skills, and already-visible tools. Relevance is normalized as `BM25 / (BM25 + 2)`, not a probability. Empty results still allow an explicit none/search decision. A committed notice is not repeated for the same claimed user batch; rejected/cancelled steps do not log a notice. Optional skill discovery has a one-second budget and falls back to tool matches.

## Settings, folders and skills

The catalog uses compact rows in collapsible plugin folders. Edit availability, summary, folder, attribution, order and associated skill names. Select a folder or individual tools to apply bulk availability across all pages. Folder actions include filtered-out descendants; Select all matching tools follows the current filter. Edits remain drafts until saved.

Personal skills belong in `~/.dsh/skills/<name>/SKILL.md` or `~/.agents/skills/<name>/SKILL.md`, with descriptive YAML name and description fields. DSH discovers them; tool search BM25-ranks their names and summaries without requiring embeddings. The stock skill loader reads full instructions. Skill bodies are not embedded or indexed by this plugin. Arbitrary GitHub skill repositories do not become DSH plugins automatically.

BM25 needs no model. Optional tool-description embeddings use an explicitly configured OpenAI-compatible endpoint, a separate persistent index, and reciprocal-rank fusion. Only metadata and search queries are sent; no models or runtimes are downloaded. Provider errors or stale vectors fall back to BM25. Retrieval is always filtered to the calling agent's permitted view.

## Scope and ownership limits

DSH restrictions intersect with upstream policies. They cannot grant permissions. Agent-own registrations and reserved transports are exempt from schema filtering; the UI labels that limit, and compact-mode execution guards still require selection. A provider must cooperate to hide an exempt schema. Unregistered lazy backends cannot be enumerated.

Ownership is inferred from installed package declarations or MCP name prefixes, with manual overrides. It is not authoritative registry ownership. Provider prompt sections remain their owners' responsibility; full stock skill-catalog text is bounded through the public pre-step hook.

Catalog reads do not probe restrictions or wait for source scans. Scoped capability probes are batched, unchanged policy masks are reused, and provenance refresh runs in the background. Requests time out after 15 seconds with Retry. Stale plugin capabilities renew through DSH's authenticated browser connection and retry once.

## Storage and development

`$DSH_HOME/dsh-tool-manager/` (normally `~/.dsh/dsh-tool-manager/`) stores owner-only settings and optional tool embeddings. Selection, browser and retrieval deduplication derive from the existing session log. Settings may contain the configured embedding API key.

Install using DSH's GitHub plugin route or official CLI:

```
dsh plugin --profile web add /absolute/path/to/dsh-tool-manager --config.ignore-scripts=true
```

Run `node --test test/*.test.js`, `node --check index.js`, and `node --check client.js` inside the plugin. Tests exercise real DSH registry, guards, restrictions, session projections and surface replacements. Host changes need a coordinated plugin reload or Harness restart. The UI uses DSH's public settings/conversation slots and theme tokens.
