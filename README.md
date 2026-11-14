# DSH Tool Manager

Choose which tools a model can see in DeepSeek Harness. Keep everyday tools available, and let the model find and load specialist tools and skill instructions when a task needs them.

Every visible tool adds a definition to the model's context. With many plugins installed, those definitions can take up space before the model starts working. Tool Manager keeps a smaller starting set and loads additional definitions on demand. You control that policy in **Settings → Tool manager**.

## What `browse_tools` does

`browse_tools` is the model's tool-discovery controller. It searches the installed catalog, selects tools or folders, and makes their original definitions available for subsequent calls. Selected skill instructions can load alongside them.

| Name | Purpose |
| --- | --- |
| `browse_tools` | Find, select and remove tool definitions from the model's available tool set. |
| `browser` folder | A selectable group of web-browser tools contributed by an installed provider. |
| `browser_open`, `browser_act`, and other `browser_*` tools | Open and operate web pages through the browser provider. |

For example:

```js
// Load the installed browser tool group.
browse_tools({action: "find", names: ["browser"]})

// The model can now call the returned browser_* tools to work with web pages.

// Later, remove that group's on-demand definitions from this conversation.
browse_tools({action: "close_tools", names: ["browser"]})
```

The `browser` folder exists when the calling agent has a suitable group of permitted, on-demand browser tools. Folder names come from the installed catalog. Other tool groups work the same way.

**Finishing tool selection and closing a web browser are separate operations.** Selecting tools finishes the tool picker. `close_tools` removes selected definitions; existing pages, cookies, provider processes and task results remain in place. Use the browser provider's own tools to change its pages or resources.

## Starting setup

New installations use **System tools + search for tasks**, with fast selection enabled. Shell and file tools, web search/fetch, planning, goals, to-dos, agent coordination, jobs, schedules, workflows, knowledge tools and the skill loader stay available. Specialist generators and integrations require discovery. Upgrades preserve saved settings.

In **Settings → Tool manager**:

- Choose a baseline for unconfigured tools.
- Set individual tools to **Always available**, **Search and select**, **Disabled**, or their inherited availability.
- Edit tool summaries, folders, order, attribution and associated skills.
- Select a folder or several tools to apply availability changes together. Save changes to apply the draft.

Explicit per-tool settings override the baseline. New tools follow the chosen baseline. Tool Manager searches tools already registered with DSH; their providers supply the capabilities and connections.

## Finding tools and skills

With **Fast tool selection**, the model describes the capability it needs:

```js
browse_tools({
  action: "find",
  task: "create an editable spreadsheet with formulas",
  keywords: ["spreadsheet", "formulas"]
})
```

The plugin searches permitted tools and model-invocable skills locally. It then sends a bounded shortlist to a separate selection request using the conversation's current model with reasoning off. The main conversation receives the chosen tool names, their definitions, any selected skill instructions, and short call hints. The shortlist stays in audit metadata.

The model then calls the selected tools to do the work. A skill supplies instructions; its provider or associated tools supply executable capabilities. Selecting a tool or skill does not execute the task.

Exact tool or folder names load directly, without an auxiliary selection request:

```js
browse_tools({action: "find", names: ["office_tools"]})
```

Capability searches use names, descriptions and registered input documentation. Tool and skill rankings are separate. The shortlist contains at most ten candidates in 10,000 characters. Fast selection requires the model to advertise reasoning Off or None; otherwise use manual selection. The auxiliary request has a 512-token output limit and a 45-second deadline after output begins. Queueing, loading and prefill fall under the cancellable outer limit. It is an additional model request with its own latency and usage.

To use **manual selection**, turn off Fast tool selection. The model can then search or browse catalog metadata, add useful names, or decline the suggestions. `add`, `none` and `close` finish the tool-picker step; `close_tools` separately removes selected definitions. While a manual selection is pending, the model must finish that choice before running task tools.

The older `tool_manager_search`, `tool_manager_select` and `tool_manager_close` controls remain available when the single `browse_tools` controller is disabled. Optional automatic suggestions are a legacy mode and stay suppressed during fast selection.

## How long selections last

Selected on-demand tools become available after a successful selection result commits. They remain available across turns until:

- The model explicitly removes them with `close_tools`.
- A successful context compaction clears all on-demand selections. Failed compaction preserves them.
- A tool selected with `use_once: true` completes one successful execution. Errors leave it selected for correction.

These selections belong to the calling conversation. Pinned tools retain their configured availability. A short folder index remains visible so tools can be found again after compaction.

Removing definitions changes future model requests. It does not cancel calls already running. Changes to tool definitions or model-facing catalog text can invalidate part of a cached prompt prefix; Tool Manager does not directly prune an inference engine's KV cache.

## Skills and search options

DSH discovers personal skills in `~/.dsh/skills/<name>/SKILL.md` and `~/.agents/skills/<name>/SKILL.md`. Tool Manager searches their names and descriptions and loads full instructions only when selected or mapped to a selected tool. It replaces the full stock skill catalog in model-facing history with a short discovery notice, preserving the registry, selected instructions and audit events.

Local BM25 search needs no embedding model. Optional semantic search uses an explicitly configured OpenAI-compatible embedding endpoint. Building the index sends tool metadata to that endpoint; semantic searches also send their queries. Provider failures or stale vectors fall back to BM25. Skill bodies are not embedded.

## Other behavior and limits

The plugin also repairs native Bash calls that omit a required `description` or `command` field. It makes one private continuation with the same model and conversation to fill only the missing field, then lets normal validation and execution proceed. An existing command cannot be replaced. Failed repairs leave normal validation to report the original error. Repair calls add separate model usage.

Tool Manager uses public DSH services and hooks. It does not edit Harness core or other plugin files. Upstream permissions remain authoritative. DSH scope rules prevent hiding some host-owned definitions; the settings page reports that limitation. Ownership labels are inferred from installed packages or MCP prefixes and can be corrected manually.

Settings and optional embedding data live under `$DSH_HOME/dsh-tool-manager/`, normally `~/.dsh/dsh-tool-manager/`. Settings can contain the configured embedding API key. Selection state is reconstructed from the session log.

## Install and develop

Supports DeepSeek Harness `>=0.2.1-rc.2 <0.3.0-0`. Install through DSH's GitHub plugin route or its CLI:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-tool-manager --config.ignore-scripts=true
```

For source checks, install development dependencies, then run:

```sh
node --test test/*.test.js
node --check index.js
node --check client.js
```

Reload the plugin or restart Harness after updating its code. [Audit notes](docs/AUDIT.md) and a [dated example tool catalog](docs/local-tool-tree.md) are available under `docs/`.
