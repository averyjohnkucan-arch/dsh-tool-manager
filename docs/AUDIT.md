# Tool manager audit

Audited against installed DeepSeek Harness 0.2.1-rc.2 public Cordis services.

## Changes verified

- Unconfigured tools preserve their provider behavior, including tools registered after startup. Explicit settings survive version 1 migration.
- Namespaced discovery controls avoid collisions with other plugins' generic tool-search names.
- Per-agent catalogs intersect with provider restrictions. Explicit disabling blocks execution even where DSH exempts locally registered schemas from hiding.
- Registry changes invalidate cached scope checks; late registration, provider disposal/reload, and scope relocation are covered.
- Removing this manager restores the original provider surface without removing other restrictions.
- Standalone model-invocable skills appear in search without requiring a tool mapping. Full instructions load only through the public skill service.
- Closing a selected tool changes availability only after successful compaction. Failed compaction preserves selection.
- Folder and checkbox bulk operations include descendants across pages, preserve unrelated tools and metadata, and remain drafts until saved. Discovery controls are protected.
- Semantic search only ranks the caller-visible catalog and falls back to BM25 on provider failure. Responses are bounded while streaming.

## Catalog performance and recovery

Catalog reads no longer enumerate and mutate restrictions for every agent, rescan package source synchronously, or initialize inactive session projections. The regression fixture serves ten reads with 200 tools and 26 agents without any registry mutations. Unchanged agent steps reuse policy masks; registration, settings, and selected-tool changes still invalidate them. A simulated stalled request verifies timeout and successful retry.

## Connection renewal and stock baseline

Capability renewal requires DSH's existing browser authentication and rejects cross-origin requests. The client retries one stale-capability response, avoiding unbounded reconnect loops. A stock-baseline integration test verifies that shipped tools remain callable while extra and newly registered tools stay hidden until committed selection; explicit choices remain authoritative.

## Limits

Tool ownership is inferred from package source because the public registry does not expose authoritative ownership. Unmatched or ambiguous providers are labelled accordingly and can be mapped manually. Unregistered lazy tools cannot be enumerated. DSH's scope-owned schema exemption prevents hiding some schemas, although explicit execution denial still applies. Existing provider prompts and historic results remain owned by their providers.

Tests use real DSH registry, restrictions, session and projection services, plus isolated lifecycle fixtures and a simulated React settings component. They do not establish compatibility with every future DSH release, hardware throughput, or visual layout in every browser. Shared DSH was not restarted during this audit because another plugin is being developed concurrently.

## Compact browser and automatic retrieval (0.2.0)

Real-service tests cover five-result automatic retrieval, committed-message deduplication, forced none/add/search choices, blocking task execution while the browser is open, compact receipt replacement on the model-facing surface, unchanged original audit events and checkpoint messages, persistent selected tools, and queued closure at compaction. Tuning limits and PTC decision replay are tested. Scope discovery probes are batched rather than probing each inherited tool individually. Old saved baselines remain compatible; new settings default to all tools on demand and the single browser controller.

Surface replacements update model history through a public API, not the inference engine's KV cache. Native browser results are individually replaceable. Catalog payloads mixed into a PTC transport result are not individually pruned. Exempt agent-local schemas may remain visible, but compact mode guards their execution until selected. This constraint is surfaced to users rather than bypassed through core patches.

The unresolved-browser turn-stop path is also tested: two bounded steering messages precede a clear error if the model keeps ignoring the choice requirement. Live owner settings were verified with All tools on demand, compact browser enabled, five-result automatic retrieval enabled, and only web_search/knowledge_search explicitly pinned. The running catalog detected 263 tools including 207 REA tools. Model instruction adherence has not been benchmarked against every supported model.

## Selection lifetime (0.2.1)

Persistent remains the default for old and new settings. Optional per-tool lifetime or per-selection use_once retires an on-demand tool only from committed native/PTC success events. Errors and replacement copies do not retire it. Replay restores the same state. Explicit closure still waits for successful compaction. Long instructions load through mapped/explicit skills, with no rewriting of provider schemas or task arguments/results. This does not control engine KV eviction.
