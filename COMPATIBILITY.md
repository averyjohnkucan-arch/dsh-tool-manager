# Compatibility

- DeepSeek Harness: `0.2.2-rc.4`
- Node.js: the version required by that DSH release
- Uses public DSH tool registry, restriction, system prompt, session projection, web server, agent, and settings-slot APIs
- Does not modify DSH core files

Official DSH tools are identified from installed `@deepseek-ai/*` package sources, with a small fallback list for host-created tools. Browser and Harness tool prefixes are always treated as stock.
