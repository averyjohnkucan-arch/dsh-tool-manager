# DSH Tool Manager

Tool Manager does one thing. It controls whether each registered tool is **Loaded** in the model context or **Hidden** behind tool search.

- Every tool registered with DSH appears in **Settings → Tool Manager**.
- Tools shipped by DSH stay loaded automatically.
- New third-party tools default to hidden.
- `tool_selection` is the only Tool Manager schema and always stays loaded.
- One search call locally shortlists up to eight tools, runs a constrained auxiliary selector with reasoning off when supported, and loads its choices into the conversation.
- Hidden tools can also be loaded by exact name and unloaded again.
- There are no baselines, disabled mode, folders, embeddings, automatic suggestions, skill injection, lifetime policies, or tool metadata editors.

The model receives one short prompt line such as:

> 24 additional tools are available through tool_selection.

It can then use:

```text
tool_selection(task="edit formulas in a spreadsheet", keywords=["spreadsheet", "formulas", "cells"])
```

Search ranking is local and deterministic. When several tools match, a bounded auxiliary request to the current model selects the smallest useful set. It requests reasoning Off/None when the model advertises it, otherwise it uses that model's default. The selector can only return exact shortlisted names and never receives executable task tools. The conversation receives only a bare receipt such as `Model selected office_write_range.`; shortlist and selector details remain audit metadata.

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
