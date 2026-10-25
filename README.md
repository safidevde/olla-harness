# Olla Harness

Local coding agent chat for VS Code, backed by Ollama.

## Run

1. `ollama pull qwen2.5-coder:7b` (or set `ollaHarness.model`)
2. Open this folder in VS Code, press **F5**
3. In the new window, open a folder and click the Olla Harness icon

`npm test` runs the tool-call parser check.

## Layout

```
src/
  extension.js   activate(): registers the view and commands
  chatView.js    sidebar view: webview <-> agent, renders messages
  agent.js       agent loop: model -> tools -> model, until a plain answer
  ollama.js      one /api/chat request
  prompt.js      system prompt (time, folder, open file)
  tools.js       tool definitions + runTool
  parse.js       pulls tool calls out of plain-text replies
  sessions.js    saved chats (workspaceState)
  history.js     chat history quick pick
  util.js        root(), cfg(), clip()
media/
  chat.html/css/js   the webview UI
```

## Release

`npm run package` builds `olla-harness-<version>.vsix` locally.

To ship: bump `version` in package.json on main, then push main to the `release` branch
(`git push origin main:release`). [.github/workflows/release.yml](.github/workflows/release.yml) builds the .vsix,
publishes it, and creates the GitHub release `v<version>` with the .vsix attached.
A version that's already released is skipped.

Repo secrets (Settings → Secrets and variables → Actions), each optional:
- `VSCE_PAT`: Azure DevOps token with Marketplace → Manage scope, for the VS Code Marketplace
- `OVSX_PAT`: open-vsx.org token, for Open VSX (Cursor, VSCodium)

Common changes:
- **New tool**: add it to `TOOLS` and a `case` in `runTool` (src/tools.js).
- **Prompt wording**: src/prompt.js.
- **UI**: media/. Reload the dev window (Cmd+R) to see changes.
