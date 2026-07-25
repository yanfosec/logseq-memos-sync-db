# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Logseq plugin that syncs notes between Logseq and Memos (a self-hosted memo hub). It's a DB-graph-compatible continuation of [EINDEX's logseq-memos-sync](https://github.com/EINDEX/logseq-memos-sync) (archived by its original author), rewritten to target Logseq 2.0.1+ and the current Memos API.

## Development Commands

```bash
# Install dependencies (enforces pnpm)
pnpm install

# Start development server with hot reload
pnpm dev

# Build the plugin for production
pnpm build

# Run tests
pnpm test

# Tests run automatically on pre-commit via Husky
```

## Architecture

### Plugin Structure
- **Entry Point**: `src/main.tsx` - Registers commands, sets up event handlers, and initializes the plugin
- **Core Logic**: `src/memos.ts` - Handles sync operations between Logseq and Memos
- **API Clients**: `src/memos/impls/` - Supports both Memos API v0 and v1 with abstracted interfaces
- **Settings**: `src/settings.ts` - Defines plugin configuration schema using Logseq's settings system

### Key Patterns
1. **API Version Abstraction**: The plugin uses a factory pattern to create the appropriate API client based on the Memos server version
2. **Sync Modes**: 
   - Journal: Syncs to daily journal pages
   - Custom Page: Syncs to a user-defined page
   - Journal Grouped: Groups memos by date in journal
3. **Event-Driven**: Uses Logseq's event system for settings changes and user commands

### Important Files
- `src/memos/client.ts`: Abstract base class for Memos API clients
- `src/memos/type.ts`: TypeScript definitions for Memos data structures
- `src/utils.ts` & `src/memos/utils.ts`: Utility functions for content generation and formatting

## Testing

Tests are located in `src/memos/__tests__/` and focus on content generation logic. The test suite runs automatically before commits.

## Build Process

The plugin uses Vite with a specialized Logseq plugin (`vite-plugin-logseq`) that:
- Bundles the plugin code
- Generates proper module exports for Logseq
- Creates the distribution package

## Release Process

Uses semantic-release with GitHub Actions for automated versioning and releases. The release creates a zip file containing:
- `dist/` folder with built assets
- `readme.md`
- `logo.svg`
- `LICENSE`
- `package.json`

## Important Considerations

1. **Memos API Compatibility**: The plugin supports both v0 and v1 of the Memos API. When making changes, ensure compatibility with both versions.
2. **Logseq API**: Uses `@logseq/libs` v0.0.10. Check Logseq documentation for API usage.
3. **Date Handling**: Uses date-fns for date manipulation. All dates should be handled consistently.
4. **Error Handling**: The plugin includes user-friendly error messages. Maintain clear error reporting for sync failures.
5. **Settings Validation**: Settings changes trigger immediate validation and re-initialization of the Memos client.

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
