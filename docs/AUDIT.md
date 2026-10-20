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

## Limits

Tool ownership is inferred from package source because the public registry does not expose authoritative ownership. Unmatched or ambiguous providers are labelled accordingly and can be mapped manually. Unregistered lazy tools cannot be enumerated. DSH's scope-owned schema exemption prevents hiding some schemas, although explicit execution denial still applies. Existing provider prompts and historic results remain owned by their providers.

Tests use real DSH registry, restrictions, session and projection services, plus isolated lifecycle fixtures and a simulated React settings component. They do not establish compatibility with every future DSH release, hardware throughput, or visual layout in every browser. Shared DSH was not restarted during this audit because another plugin is being developed concurrently.
