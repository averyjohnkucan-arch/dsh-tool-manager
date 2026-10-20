# DSH Tool manager

A standalone Cordis plugin for DeepSeek Harness 0.2.1-rc.2. It uses public services and hooks without modifying Harness core or other plugins.

## Compact tool browser

New installations default to **All tools on demand** and **Use one tool browser**. Existing saved baselines and explicit tool settings are preserved. Pin essential tools as Always available; all other unconfigured tools require discovery, including tools registered later. Older Provider defaults and Stock tools baselines remain selectable.

The model uses one controller:

- `browse_tools(action="search", task="what I need to accomplish")` searches compact descriptions. `action="browse"` supports folder, offset and limit. Results contain no parameter schemas. Seven matches and at most 64 folder names are returned by default.
- `action="add", names=[...]` adds useful tools, usually one or two, with a configurable maximum of seven per call. Optional `skills=[...]` loads model-invocable instructions through DSH's public skill service. A skill-only selection opens the stock skill loader.
- `action="close"` closes the browser. `action="none"` closes it without adding tools. Task tools are blocked while the compact browser remains open. If the model attempts to finish before deciding, the public turn-stopping hook steers it back at most twice, then reports an explicit choice-required error instead of looping indefinitely.
- `action="close_tools", names=[...]` acknowledges queued closure. Selected tools remain available until a successful compaction. Failed compaction preserves them; reselecting cancels queued closure.

After browser closure, the next pre-step replaces only this plugin's catalog payloads on the model-facing session surface with a receipt such as `No tools selected` or `3 tools selected`. It uses public, durable single-node surface replacements, retaining the original transcript and audit events. Other plugins' messages, user text, task output and skill bodies are not rewritten. This is not a literal session rollback or a direct command to prune an inference engine's KV cache. Schema changes and replacements can invalidate the prefix from their insertion positions. Catalog payloads inside mixed PTC transport results cannot be individually rewritten; the direct Native browser path is covered by the replacement tests.

The three older `tool_manager_search`, `tool_manager_select`, and `tool_manager_close` controls remain available in compatibility mode. Compact mode hides them and uses `browse_tools` instead. Only successful committed results update selection and browser state; malformed or failed calls do not grant tools or close the browser.

## Automatic tool_retrieval

Open **Settings → Tool manager → Automatic tool retrieval**. The feature is off until enabled. It suggests five relevant tools before a new user request, using local BM25. Suggestions appear as an expandable `tool_retrieval` notice and do not activate tools. The model must select, decline, or search for more; after adding, it must close the browser before task-tool execution.

Tuning controls include maximum results (1–20), minimum relevance, summary length, total injected characters, cooldown, matching skills, and already-visible tools. Relevance is normalized as `BM25 / (BM25 + 2)`, not a probability. Empty results still allow an explicit none/search decision. A committed notice is not repeated for the same claimed user batch; rejected/cancelled steps do not log a notice. Optional skill discovery has a one-second budget and falls back to tool matches.

## Settings, folders and skills

The catalog uses compact rows in collapsible plugin folders. Edit availability, summary, folder, attribution, order and associated skill names. Select a folder or individual tools to apply bulk availability across all pages. Folder actions include filtered-out descendants; Select all matching tools follows the current filter. Edits remain drafts until saved.

Personal skills belong in `~/.dsh/skills/<name>/SKILL.md` or `~/.agents/skills/<name>/SKILL.md`, with descriptive YAML name and description fields. DSH discovers them; tool search BM25-ranks their names and summaries without requiring embeddings. The stock skill loader reads full instructions. Skill bodies are not embedded or indexed by this plugin. Arbitrary GitHub skill repositories do not become DSH plugins automatically.

BM25 needs no model. Optional tool-description embeddings use an explicitly configured OpenAI-compatible endpoint, a separate persistent index, and reciprocal-rank fusion. Only metadata and search queries are sent; no models or runtimes are downloaded. Provider errors or stale vectors fall back to BM25. Retrieval is always filtered to the calling agent's permitted view.

## Scope and ownership limits

DSH restrictions intersect with upstream policies. They cannot grant permissions. Agent-own registrations and reserved transports are exempt from schema filtering; the UI labels that limit, and compact-mode execution guards still require selection. A provider must cooperate to hide an exempt schema. Unregistered lazy backends cannot be enumerated.

Ownership is inferred from installed package declarations or MCP name prefixes, with manual overrides. It is not authoritative registry ownership. Existing provider prompt sections and skill summaries remain their owners' responsibility.

Catalog reads do not probe restrictions or wait for source scans. Scoped capability probes are batched, unchanged policy masks are reused, and provenance refresh runs in the background. Requests time out after 15 seconds with Retry. Stale plugin capabilities renew through DSH's authenticated browser connection and retry once.

## Storage and development

`$DSH_HOME/dsh-tool-manager/` (normally `~/.dsh/dsh-tool-manager/`) stores owner-only settings and optional tool embeddings. Selection, browser and retrieval deduplication derive from the existing session log. Settings may contain the configured embedding API key.

Install using DSH's GitHub plugin route or official CLI:

```
dsh plugin --profile web add /absolute/path/to/dsh-tool-manager --config.ignore-scripts=true
```

Run `node --test test/*.test.js`, `node --check index.js`, and `node --check client.js` inside the plugin. Tests exercise real DSH registry, guards, restrictions, session projections and surface replacements. Host changes need a coordinated plugin reload or Harness restart. The UI uses DSH's public settings/conversation slots and theme tokens.
