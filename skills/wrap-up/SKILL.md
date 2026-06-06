---
name: wrap-up
description: Close out MCP-backed Cline work when asked to "wrap up", "export requirements", or "close out".
---

Trust marker details only after the TypeScript bridge verifies workspace/marker state. Use tools in `src/tools/requirements.ts`, `src/tools/session*.ts`, `src/tools/todo.ts`, and workspace helpers in `src/tools/plugin-helpers.ts`; do not use raw REST for normal MCP mutations.

`workflow.*` names below are plugin workflow/REPL method names used by the bridge, not literal Cline-visible MCP tool names. Cline-visible tools use this plugin's host-facing names, and native `/mcp-transport` tools use names such as `sessionlog_*`, `todo_*`, and `requirements_*`. Do not declare the plugin unavailable solely because generic MCP discovery does not list literal `workflow.*` names.

Reconcile requirements through `workflow.requirements.*`, export wiki documents with `workflow.requirements.generateDocument`, run validation, then use the `commit-sync` pause contract for commit/push. Reconcile the session log with `workflow.sessionlog.appendDialog` and `workflow.sessionlog.appendActions`.

Complete the turn with `workflow.sessionlog.completeTurn`. Use `workflow.sessionlog.failTurn` for validation failure, export failure, or blocked commit/push.
