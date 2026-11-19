# DSH Tool Manager

Tool Manager does one thing. It controls whether each registered tool is **Loaded** in the model context or **Hidden** behind tool search.

- Every tool registered with DSH appears in **Settings → Tool Manager**.
- Tools shipped by DSH stay loaded automatically.
- New third-party tools default to hidden.
- `browse_tools` always stays loaded.
- Hidden tools can be searched, loaded into one conversation, and unloaded again.
- There are no baselines, disabled mode, folders, embeddings, automatic suggestions, skill injection, lifetime policies, or tool metadata editors.

The model receives one short prompt line such as:

> 24 additional tools are hidden and available through browse_tools.

It can then use:

```text
browse_tools(action="search", query="spreadsheet formulas cells")
browse_tools(action="load", names=["office_write_range"])
browse_tools(action="unload", names=["office_write_range"])
```

Search is local and deterministic. It does not make a second model request.

## Install

This release targets DeepSeek Harness `0.2.2-rc.4`.

```sh
dsh plugin --profile web add /absolute/path/to/dsh-tool-manager --config.ignore-scripts=true
```

Run checks with:

```sh
npm test
npm run check
```
