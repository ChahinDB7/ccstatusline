# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Note:** `CLAUDE.md` is a symlink to `AGENTS.md`. Edit `AGENTS.md` (the real file) — do not replace the symlink. One doc serves Claude Code, Codex, and other agents.

## Project Overview

ccstatusline is a customizable status line formatter for Claude Code CLI that displays model info, git status, token usage, context window, usage/rate-limit windows, and other metrics. It runs in two modes:
1. **Piped mode** — Claude Code pipes a JSON status payload to stdin; ccstatusline prints one formatted status line.
2. **Interactive mode** — run with no piped input, it launches a React/Ink TUI for configuring the status line.

`src/ccstatusline.ts` detects which mode to use based on whether stdin is a TTY / has piped data.

## Development Commands

```bash
bun install              # Install deps (also applies the ink@6.2.0 patch)
bun run start            # Launch interactive TUI

# Piped mode test (use [1m] suffix for 1M-context models)
echo '{"model":{"id":"claude-sonnet-4-5-20250929[1m]"},"transcript_path":"test.jsonl"}' | bun run src/ccstatusline.ts
bun run example          # Same, using scripts/payload.example.json

bun test                 # Run all tests
bun test <path>          # Run a single test file
bun test -t "<pattern>"  # Run tests matching a name pattern

bun run lint             # tsc --noEmit + eslint (--max-warnings=0); CI runs this
bun run lint:fix         # Same, but apply ESLint autofixes (only when intended)

bun run build            # Bundle to dist/ccstatusline.js (Node 14+ target)
bun run docs             # Generate TypeDoc into typedoc/
```

CI (`.github/workflows/ci.yml`) runs three jobs: **lint**, **test**, and **build** (build also asserts `dist/ccstatusline.js` exists). Match these locally before pushing.

## Architecture

Dual runtime: the same source runs under Bun (dev) and the bundled output runs under Node.js 14+ (published binary). Avoid Bun-only APIs in code paths that ship in `dist/`; stdin reading branches on `Bun` vs Node at runtime.

### Entry point
- **src/ccstatusline.ts** — mode detection; in piped mode parses `StatusJSON` from stdin and calls the renderer, in interactive mode mounts the TUI.

### Rendering (src/utils/)
- **renderer.ts** — core pipeline: resolves widgets, applies colors/padding/separators, handles truncation and flex-separator expansion.
- **FlexMode** (`src/types/FlexMode.ts`) — three terminal-width modes: `full`, `full-minus-40`, `full-until-compact` (default `full-minus-40`).
- **colors.ts / ansi.ts / color-sanitize.ts** — color definitions, ANSI mapping, sanitization.
- **powerline.ts / powerline-settings.ts / powerline-theme-index.ts** — Powerline font detection/install and themes.
- **hyperlink.ts** — OSC 8 terminal hyperlinks (Link widget).

### TUI (src/tui/)
- **index.tsx** mounts Ink; **App.tsx** owns navigation/state.
- **components/** — one component per screen: MainMenu, LineSelector, ItemsEditor, ColorMenu (+ `color-menu/mutations.ts`), GlobalOverridesMenu, PowerlineSetup/ThemeSelector/SeparatorEditor, TerminalOptionsMenu, TerminalWidthMenu, RefreshIntervalMenu, InstallMenu, StatusLinePreview, plus shared List/ConfirmDialog.
- **components/items-editor/input-handlers.ts** — keyboard handling for the items editor, unit-tested separately from the component.

### Widgets (src/widgets/)
Each widget is a class implementing the `Widget` interface in `src/types/Widget.ts`. Required methods: `getDefaultColor`, `getDescription`, `getDisplayName`, `getCategory`, `getEditorDisplay`, `render`, `supportsRawValue`, `supportsColors`. Optional: `renderEditor` (Ink editor UI), `getCustomKeybinds`, `handleEditorAction`, `getNumericValue`. Shared widget helpers live in `src/widgets/shared/`.

**Registration is manifest-driven** — to add a widget:
1. Create the class in `src/widgets/`.
2. Export it from `src/widgets/index.ts`.
3. Add an entry to `WIDGET_MANIFEST` in `src/utils/widget-manifest.ts` (layout-only items like separators go in `LAYOUT_WIDGET_MANIFEST`).

`src/utils/widgets.ts` builds the runtime registry from the manifest and provides the TUI widget picker (categories + fuzzy search/scoring/highlight via `getWidgetCatalog` / `filterWidgetCatalog` / `getMatchSegments`). Renamed widget types stay backward-compatible through `LEGACY_WIDGET_TYPE_ALIASES` / `resolveLegacyWidgetType` (e.g. `git-pr` → `git-review`).

Widgets are grouped by `getCategory()` into families: Claude metadata (Model, Version, OutputStyle, ThinkingEffort, VimMode, ClaudeSessionId, ClaudeAccountEmail, SessionName), Git (branch/status/staged/unstaged/untracked/conflicts/sha/ahead-behind, origin & upstream owner/repo, fork, worktree, PR review), tokens & speed (TokensInput/Output/Cached/Total, Input/Output/TotalSpeed), context (ContextLength, ContextPercentage, ContextPercentageUsable, ContextBar), usage/time/cost (SessionUsage, WeeklyUsage, BlockTimer, reset timers, SessionClock, SessionCost), environment (CurrentWorkingDir, TerminalWidth, FreeMemory, Skills), and custom (CustomText, CustomSymbol, CustomCommand, Link).

### Data sources (src/utils/)
- **jsonl.ts** — facade re-exporting transcript parsing split across `jsonl-blocks.ts` (5-hour billing blocks), `jsonl-metrics.ts` (token/speed/duration metrics), `jsonl-metadata.ts` (thinking effort), and `jsonl-cache.ts` (block cache keyed by a hash of the Claude config dir).
- **context-window.ts** — context window metrics (window size, used/remaining %) from `StatusJSON`; window size is model-dependent (1M for `[1m]`-suffixed models, else 200k — see `model-context.ts`).
- **usage.ts** — facade over the usage subsystem: `usage-fetch.ts` calls the Claude usage API (caches to `~/.cache/ccstatusline/usage.json` with a lock file + rate-limit backoff), `usage-windows.ts` derives 5-hour and 7-day usage windows, `usage-types.ts` holds schemas. Powers SessionUsage/WeeklyUsage/reset-timer/ContextBar widgets.
- **speed-metrics.ts / speed-window.ts** — tokens/sec calculations.
- **skills.ts** — reads skill-invocation logs at `~/.cache/ccstatusline/skills/skills-<sessionId>.jsonl`, populated by a Claude Code hook this tool installs.
- **git.ts / git-remote.ts / git-review-cache.ts** — `runGit`/`runGitArgs` wrappers (`execSync`), origin/upstream/fork resolution, and PR-review caching.

### Config & integration (src/utils/)
- **config.ts** — loads/saves ccstatusline settings at `~/.config/ccstatusline/settings.json`; on load it runs **migrations.ts** (versioned v1→v2→v3, `migrateConfig`/`CURRENT_VERSION`) and backs up unparseable files. Settings are Zod-validated (`src/types/Settings.ts`).
- **claude-settings.ts** — reads/writes Claude Code's `settings.json`. Resolves the config dir from `CLAUDE_CONFIG_DIR`, falling back to `~/.claude`. Holds the install-command constants and detects/updates the `statusLine` entry.
- **hooks.ts** — installs/removes Claude Code hooks tagged `ccstatusline-managed` (used to capture skill invocations, etc.).

### Cache & config locations
- `~/.config/ccstatusline/settings.json` — ccstatusline settings.
- `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR`) — Claude Code settings.
- `~/.cache/ccstatusline/` — `block-cache-*.json`, `usage.json` + `usage.lock`, `skills/skills-<sessionId>.jsonl`.

## Build & Distribution

- `bun run build` clears `dist/`, bundles `src/ccstatusline.ts` into a single `dist/ccstatusline.js` (`--target=node --target-version=14`, all runtime deps inlined), then `postbuild` runs `scripts/replace-version.ts` to swap the `__PACKAGE_VERSION__` placeholder with `package.json`'s version.
- Only `dist/` is published (`package.json` `files` + `bin`).
- The TUI's install flow points Claude Code at the locally built `dist/ccstatusline.js` (this fork's customization) rather than `npx -y ccstatusline@latest`; run `bun run build` before installing.

## Conventions & Gotchas

- **Bun first** — prefer `bun <file>` / `bun install` / `bun run <script>` over the Node/npm equivalents. Bun auto-loads `.env`, so don't add dotenv.
- **Linting** — run checks only via `bun run lint` / `bun run lint:fix`. Never invoke `npx eslint`, `eslint`, `tsx`, `bun tsc`, or other variants directly. The config is flat-config ESLint (`eslint.config.js`) with TypeScript + React plugins; `--max-warnings=0` means warnings fail the build.
- **Never disable a lint rule via an inline comment**, however benign it looks — fix the underlying code.
- **ink@6.2.0 patch** — `patches/ink@6.2.0.patch` fixes macOS backspace (`\x7f` was treated as delete). Applied automatically on `bun install` via `patchedDependencies`.
- **Tests** — Vitest-style files (`import { ... } from 'vitest'`, `src/**/*.test.ts(x)`) run under `bun test` (Bun's native runner via its vitest compat layer). ~80 test files cover utils (config/migrations, jsonl parsing, usage windows, git, renderer, context) and individual widgets.
- **Hand-written docs** live in `docs/` (USAGE.md, WINDOWS.md, DEVELOPMENT.md); generated API docs go to `typedoc/`.
