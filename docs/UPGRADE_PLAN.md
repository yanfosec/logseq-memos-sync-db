# Upgrade Plan: logseq-memos-sync

Status snapshot as of 2026-07-24. Sections 1-6 are the original audit
(2026-07-23), based on reading the source tree and comparing against the live
Memos API reference. Section 7 covers the upgrade that has since been
implemented and verified live against a real Memos server.

## 7. Implemented and live-verified (2026-07-24)

All items in section 3 have been fixed in `src/memos/impls/clientV1.ts` and
verified with a throwaway script hitting a real Memos instance
(create → update with `updateMask` → archive via `state` → list → delete):

- `updateMemo` sends `updateMask` — confirmed the server accepts and applies
  partial updates correctly.
- Archive uses `state: "ARCHIVED"` (not `row_status`) — confirmed the memo's
  state actually flips server-side.
- **Correction to the original plan**: `STATE_UNSPECIFIED` does **not** act
  as an "all states" wildcard on a live server — it silently behaves like the
  default (`NORMAL` only), same as omitting `state` entirely. Only an
  explicit `state=ARCHIVED` request returns archived memos. `includeArchive`
  is therefore implemented as two sequential paginated phases (NORMAL, then
  ARCHIVED), with the phase encoded in the opaque `pageToken` handed back to
  the caller, so `MemosSync.sync()`'s loop doesn't need to know about it.
- `pageToken` pagination round-trips correctly (token from one response is
  accepted by the next request).
- Memo `id` is the trailing segment of `name` (e.g. `memos/eAgG5d...` →
  `eAgG5d...`), used directly as the `PATCH /api/v1/memos/{id}` path
  parameter — confirmed working.
- Toolchain upgrade (`@logseq/libs` 0.0.17, TypeScript 5.9.3, Vite 8.1.5)
  builds and passes the existing test suite.

**Attachment URL confirmed (2026-07-24)**: tested against a real memo with a
PDF attachment. `${host}/file/attachments/{id}/{filename}` returns HTTP 200
with the correct `content-type` (`application/pdf`) — the guess in
`src/memos/utils.ts` was correct, no code change needed. The old V0 route
`/o/r/{id}` still responds but with `text/html`, not the raw file — confirms
it's genuinely dead and was right to drop.

All items from section 3 are now implemented and live-verified. No known
outstanding Memos-API issues.

## 1. What this plugin does today

- Logseq plugin (Vite + `vite-plugin-logseq`) that syncs Memos <-> Logseq.
- Entry point `src/main.tsx` registers a command palette action ("Sync Memos"),
  a slash command per configured visibility, a settings-changed hook, and
  auto-sync on Logseq startup.
- `src/memos.ts` (`MemosSync`) owns sync orchestration: paginated pull from
  Memos, dedup against existing Logseq blocks (`searchExistsMemo`), insertion
  in one of three modes (`Journal`, `Custom Page`, `Journal Grouped`), and
  push of a Logseq block back to Memos (`post`).
- `src/memos/client.ts` defines the `MemosClient` interface and
  `MemosGeneralClient`, a factory that is supposed to pick between a V0 and
  V1 API implementation.
- `src/memos/impls/clientV0.ts` / `clientV1.ts` are the two API
  implementations. `clientV0` targets the old `/api/memo` REST shape,
  `clientV1` targets `/api/v1/memos`.
- `src/settings.ts` defines the Logseq settings schema (host/token/openId,
  sync mode, background sync interval, tag filter, etc).
- `src/memos/utils.ts` / `src/utils.ts` handle content transforms (TODO/DONE
  markers, block property stripping) and Logseq DB queries.

## 2. Dependency staleness

| Package | Repo has | Latest (npm, checked today) |
|---|---|---|
| `@logseq/libs` | 0.0.10 | **0.0.17** |
| `typescript` | 4.9.3 | **7.0.2** |
| `vite` | 3.2.7 | **8.1.5** |
| `vite-plugin-logseq` | 1.1.2 | not checked — verify compatibility with Vite 8 |
| `axios` | ^1.10.0 | 1.18.1 (already reasonably current) |

`@logseq/libs` is 7 minor versions behind — the Logseq plugin API has moved
on since 0.0.10; settings schema, `logseq.DB.q`, and editor APIs should be
re-checked against 0.0.17's type definitions before relying on current
behavior. TypeScript/Vite are multiple majors behind, which likely blocks a
clean `pnpm install`/`build` on a fresh machine today and should be the
first thing verified.

## 3. Memos API: confirmed breaking mismatches

Verified against the live API reference (Memo Service — ListMemos,
UpdateMemo). These are not hypothetical — they are concrete bugs in
`src/memos/impls/clientV1.ts` against the *current* documented API:

1. **`updateMemo` is missing the required `updateMask` query parameter.**
   The current Memos API requires `updateMask` (e.g.
   `updateMask=content,visibility`) on `PATCH /api/v1/memos/{memo}` — "the
   list of fields to update... Required." `clientV1.updateMemo` (client.ts
   impls/clientV1.ts:173-211) sends a bare PATCH body with no `updateMask`
   at all, so updates/archive calls against a current Memos server will
   likely be rejected outright.

2. **Archive uses the wrong field name.** `insertMemo`/`archiveMemo` in
   `memos.ts` build `{ rowStatus: "ARCHIVED" }`, and `clientV1.updateMemo`
   translates that to `row_status: "ARCHIVED"`. The current API's archive
   field is **`state`** (`STATE_UNSPECIFIED | NORMAL | ARCHIVED`), not
   `row_status`. This is V0-era naming leaking into the V1 client — archive
   silently no-ops against current servers.

3. **List filtering by archive status uses a client-side guess.**
   `clientV1.getMemos` filters locally on `memo.state === 'NORMAL'` after
   fetching everything, rather than using the documented `state` query
   parameter on `ListMemos` (`state?: NORMAL | ARCHIVED`, defaults to
   `NORMAL`). Today it also never requests archived memos server-side even
   when `includeArchive` is true — it can only filter down, never expand,
   what the server already decided to return.

4. **`resourceList` mapping is stale.** The current `ListMemos`/`UpdateMemo`
   response uses an **`attachments`** array, not `resources`.
   `clientV1.getMemos` reads `memo.resources` (client.ts impls/clientV1.ts:159)
   which will be `undefined` against the current API, silently dropping all
   attachments/images from synced memos.

5. **`displayTime` is not present** in the current documented Memo schema
   (only `createTime`/`updateTime`). `clientV1` computes `displayTs` from
   `memo.displayTime`, which will produce `NaN`/invalid dates today. Needs
   re-verification — either fall back to `createTime` or confirm the field
   was actually removed vs. just omitted from the reference example.

6. **The numeric-ID shim is a structural liability.** Memos V1 identifies
   memos by resource name (`memos/{id}`), not a stable integer. The current
   code (`generateNumericId`) hashes the name into a number and keeps the
   real name in an **in-memory** `Map` (`idMap`) that is only populated by a
   prior `getMemos()` call in the same plugin session. Consequences:
   - `post()` → `updateMemos()` for a block whose `memo-id` property refers
     to a memo not yet fetched in this session (e.g. right after Logseq
     restart, before any sync ran) throws `Memo ID not found in mapping`.
   - Hash collisions, while unlikely, are unhandled — two different memo
     names hashing to the same int would corrupt the mapping.
   - This is also why `Memo.id` is typed `number` throughout
     (`src/memos/type.ts`) while the real API is string-keyed — a type-level
     mismatch baked into the whole sync pipeline (dedup query in
     `searchExistsMemo`, Logseq block property `memo-id`, `lastSyncId`
     high-water-mark logic in `memos.ts`).

7. **Pagination cursor model mismatch.** `memos.ts`'s `sync()` loop treats
   pagination as a numeric `offset` it increments by `BATCH_SIZE`, but V1
   pagination is token-based (`pageToken`) with no numeric offset concept.
   `clientV1.getMemos` works around this by ignoring `offset` and instead
   tracking `nextPageToken` as private instance state, returning `[]` if
   `offset > 0` and no token is cached yet. This happens to work only
   because the loop always calls sequentially on the same client instance —
   it's fragile (any concurrent/reordered call breaks it) and makes the
   `offset` parameter in the `MemosClient` interface actively misleading.

## 4. Dead code / cleanup candidates

- `MemosGeneralClient.getClient()` (`src/memos/client.ts`) unconditionally
  returns `this.v1` — `clientV0.ts` is fully constructed but never actually
  used by the plugin itself (only referenced from the standalone
  `src/test-connection.ts` script). Confirm whether any users are still on
  legacy Memos V0 servers before deleting; if not, remove `clientV0.ts` and
  the V0 branch of `configMigrate()`/settings copy ("Please upgrade memos to
  v0.15.0...") since it's actively confusing (settings UI still talks about
  `openId`/V0 upgrade guidance for a client path that's dead).
- `src/test-connection.ts` imports `dotenv`, which is **not** in
  `package.json` dependencies or devDependencies — this script cannot run
  as-is (`pnpm install` won't fetch it). Either add `dotenv` as a devDep and
  wire it into `package.json` scripts, or delete the script if it was a
  local debugging aid that shouldn't ship.
- Very verbose `console.log` instrumentation was added throughout
  `memos.ts`/`clientV1.ts` in the last real feature commit
  (`8bb87ab feat: add comprehensive debug logging`), including logging full
  batch-block JSON on every insert. This should be gated behind a debug
  setting before this is treated as production-ready again — right now
  every sync spams the console, and V1 request logging includes the
  token-presence flag but not the token itself, which is fine, but the
  overall verbosity should not ship at this level by default.

## 5. Recommended upgrade sequence

1. **Toolchain first.** Bump `typescript`, `vite`, `@logseq/libs` to current
   majors; confirm `vite-plugin-logseq` still supports the newer Vite; get
   `pnpm install && pnpm build` green before touching sync logic. This is
   pure risk-reduction — do it before API changes so build breaks and API
   breaks aren't debugged simultaneously.
2. **Rewrite `clientV1` against the current Memo Service contract**:
   switch `Memo`/internal types to string IDs (`name`), stop hashing IDs,
   persist the id↔name mapping (or just use the name directly and drop the
   numeric shim entirely — Logseq block properties can store strings), add
   `updateMask` to all PATCH calls, fix `state` vs `row_status`, read
   `attachments` instead of `resources`, and use the server-side `state`
   filter for `includeArchive` instead of client-side filtering.
3. **Fix pagination properly** — either thread `pageToken` through
   `MemosSync.sync()`'s loop instead of a numeric cursor, or keep the
   client-side token cache but make the `MemosClient` interface honest
   about it (return `{ memos, nextPageToken }` rather than pretending
   `offset` is meaningful).
4. **Decide the fate of V0 support** — drop it (recommended, since Memos V0
   is long EOL and the plugin already effectively only runs V1) or fix it
   deliberately; don't leave it half-wired as now.
5. **Re-verify `@logseq/libs` 0.0.17 API surface** used by this plugin:
   `logseq.useSettingsSchema`, `logseq.DB.q` query syntax in
   `searchExistsMemo`, `logseq.Editor.insertBatchBlock`,
   `logseq.Editor.upsertBlockProperty`, `logseq.App.getUserConfigs()`. None
   of these were checked against the new version in this pass — check the
   published type defs for renames/signature changes before assuming they
   still work.
6. **Add real test coverage for the client layer.** The only existing tests
   (`src/memos/__tests__/utils.test.ts`) cover content-generation string
   transforms, not the API clients or sync loop — the bugs in section 3
   would all have been caught by a test that mocks the documented V1
   response shape and asserts on the request sent.
7. **Trim debug logging** to a `debug` setting flag once the above is
   stable, and update `readme.md` (currently marked archived/warning banner)
   once the plugin is confirmed working again.

## 6. Sources checked

- Live source tree of this repo (all files under `src/`).
- `npm view @logseq/libs version` / `vite` / `typescript` (2026-07-23).
- `https://usememos.com/docs/api/latest` — Overview, pagination, filtering,
  field-mask sections.
- `https://usememos.com/docs/api/latest/memoservice/ListMemos` — query
  params and response schema.
- `https://usememos.com/docs/api/latest/memoservice/UpdateMemo` — path/query
  params and response schema.

Not yet checked: CreateMemo/GetMemo full schemas, Auth Service (token
creation flow may have changed), and whether `displayTime` genuinely no
longer exists in the current Memo Service schema or was just omitted from
the reference example. Attachments are now confirmed (section 7).

## 8. Logseq compatibility: targeting 2.0.1+ (DB graphs)

Decision (2026-07-24, user request): target **Logseq 2.0.1 and later**, the
new database-graph app — not the file-based "Logseq OG" fork. Context:

- Logseq split into two products in April 2026: **Logseq OG**
  (`github.com/logseq/og`, file-based Markdown, maintenance mode only) and
  **Logseq** (`github.com/logseq/logseq`, database graphs, "the main version
  going forward," currently 2.0.1 Beta). This plugin was originally written
  against the OG/file-graph model.
- **Critical correction**: `npm view @logseq/libs version` returns `0.0.17`
  (the `latest` dist-tag), which is the frozen file-graph-era SDK. The
  actively developed DB-graph SDK is published under the **`next`** dist-tag
  at **0.3.4** — a different generation entirely (0.0.x → 0.2.x → 0.3.x,
  with real breaking changes). The plugin now depends on
  `@logseq/libs@^0.3.4`, not `^0.0.17`. Anyone checking "latest" via the
  default npm tag will get the wrong SDK for DB-graph work — worth
  remembering for future upgrades too.
- Per Logseq's own docs, DB-graph plugin support is **not automatic**; a
  plugin must explicitly target the newer SDK/APIs. Only ~65 plugins
  currently declare DB support in the marketplace.

### Breaking changes found in @logseq/libs 0.3.4 vs 0.0.10 (fixed)

- `BlockEntity.content` is now `string | undefined` (was `string`) — nodes
  can exist without content. Fixed in `post()` and `checkGroupBlock()`.
- `Editor.getPageBlocksTree` now returns `Array<BlockEntity> | null` (was
  non-nullable). Fixed with a `|| []` fallback.
- `onSettingsChanged` callback signature changed from `(e: IHookEvent) =>
  void` to `(next, prev) => void` (full settings snapshots, not a hook
  event). We don't use the argument, so just dropped the stale type.
- `App.getUserConfigs()`'s `AppUserConfigs` type dropped the named
  `preferredTodo` field (now only reachable via its index signature as
  `unknown`) — already handled since we `String()`-coerce it.

### The real risk: property namespacing on DB graphs

Per Logseq's `db-version-changes.md`: "All property related calls like
`upsertBlockProperty` work with DB graphs... Properties are namespaced to
`:plugin.property._api`" unless explicitly registered. Our dedup mechanism
(`searchExistsMemo`) searched the *whole graph* via a `logseq.DB.q` DSL query
(`(property memo-id ...)`) — this is very likely to miss plugin-set
properties living in that internal namespace on a DB graph, which would
cause **duplicate memo blocks on every sync** (the single worst possible
regression for this plugin).

Fixed with two changes:

1. **New primary dedup mechanism**: `src/utils.ts` now maintains a
   `synced-memos.json` index via `logseq.FileStorage` (the plugin's own
   private file storage — graph-model-agnostic, works identically on file
   and DB graphs). `MemosSync.sync()` checks this index first; it's the
   authoritative source of truth going forward.
2. **Best-effort legacy fallback**: `searchExistsMemoLegacy()` (the old
   `DB.q` search) still runs for memos not found in the new index, wrapped
   in try/catch, so pre-upgrade file-graph installs don't get duplicate
   blocks for memos already synced before this index existed. This is
   explicitly a compatibility bridge, not something to rely on for DB
   graphs.
3. **Property registration**: `MemosSync` now calls the new
   `Editor.upsertProperty("memo-id"/"memo-visibility", {...})` API (added in
   0.3.4) on startup, best-effort, to register these as real schema
   properties rather than leaving them in the internal plugin-only
   namespace — this is what the "DB-compatible" reference plugins
   (`logseq-checklist`, `logseq-zoterolocal-plugin`) do.

### What's still unverified

I do not have a way to run the actual Logseq 2.0.1 desktop (Electron) app or
load an unpacked plugin into it from this environment — no browser/GUI
automation was available this session. Everything in this section is
grounded in Logseq's official docs and the installed `@logseq/libs` 0.3.4
type definitions, cross-checked against real DB-compatible plugin source
(`kerim/logseq-checklist`), but **none of it has been exercised against a
live running Logseq 2.0.1 graph**. Specifically unverified:

- Whether `upsertProperty` + `upsertBlockProperty` actually produce a
  property that's visible/queryable the way we expect in the UI.
- Whether `logseq.DB.q`'s DSL `(property ...)` filter behaves as documented
  against DB graphs at all (the legacy fallback assumes it might not).
- Whether `logseq.FileStorage` persists correctly across app restarts on the
  2.0.1 beta specifically (it's a long-standing API, but 2.0.1 is new).
- General UI/UX: settings panel rendering, command palette, slash commands —
  no reason to expect breakage per the type defs, but not run.

**Recommended manual test** (needs a human with the desktop app): build
(`pnpm build`), then in Logseq 2.0.1 go to Settings → Plugins → "Load
unpacked plugin" and select the `dist/` folder (or repo root, per
`package.json`'s `main`/`logseq.main` config), configure the Memos
host/token, run "Sync Memos" once, then run it again — the second run should
insert zero new blocks (dedup working). Then check whether the `memo-id`
property shows up normally on synced blocks in the DB graph's property UI.

## 9. Live-tested against Logseq 2.0.1 desktop + a real Memos server (2026-07-24)

Loaded the unpacked plugin into a real Logseq 2.0.1 (DB-graph) install via
computer-use automation and drove it against a real Memos instance
(`memo.yanfosec.com`). This is the first time this rebuild has actually run
inside Logseq rather than just type-checking against `@logseq/libs`. Several
bugs only showed up here — none of them were visible from reading the code
or the type defs alone.

### Bugs found and fixed

1. **`sendVisibility.forEach` crashed on every plugin load.**
   [main.tsx:31](../src/main.tsx#L31) read `logseq.settings` immediately
   after calling `settingSchema()` and called `.forEach` on
   `sendVisibility` unguarded. On this SDK version, settings-schema
   defaults do not hydrate `logseq.settings` synchronously, so
   `sendVisibility` was `undefined` on first load. Because this line ran
   synchronously in `main()`, the exception aborted everything after it in
   the same function — meaning slash-command registration and
   `autoSyncWhenStartLogseq()` silently never ran. Fixed with a `(sendVisibility
   || [])` guard.

2. **CORS blocked every Memos API request outright (the big one).**
   Logseq 2.0.1 runs plugins inside a sandboxed iframe with origin
   `lsp://logseq.com`. `clientV1.ts`'s axios calls are plain
   browser `XMLHttpRequest`s, which are subject to standard CORS — and
   `memo.yanfosec.com` sends no `Access-Control-Allow-Origin` header, so
   every request failed with `Access to XMLHttpRequest ... has been blocked
   by CORS policy`, surfaced to the plugin as a generic axios "Network
   Error". This is a platform change, not a bug introduced by this
   rewrite: the old file-graph Logseq ran plugin code without this iframe
   sandbox. Fixed by replacing axios with `logseq.Net.request()`
   (`@logseq/libs` 0.3.4's `LSPluginNet` module — see
   `node_modules/@logseq/libs/dist/modules/LSPlugin.Net.d.ts`), which its
   own doc comment states is "proxied by the host process so iframe
   plugins can avoid browser CORS limitations" on desktop. `axios` is no
   longer a runtime dependency of the client (bundle dropped from 197KB to
   151KB); it's still listed in `package.json` but unused — worth removing
   in a follow-up. GET, POST, and PATCH were each independently verified
   live against the real server after this fix (see below) — this was the
   single highest-risk change in the whole rebuild and is now the
   best-verified part of it.

3. **`saveSyncedMemoIndex` wrote the wrong type to `FileStorage`.**
   [utils.ts:89](../src/utils.ts#L89) passed a plain object directly to
   `logseq.FileStorage.setItem`, whose type signature (`string | any`) is
   misleading — the underlying implementation requires a string and threw
   `TypeError [ERR_INVALID_ARG_TYPE]: The "data" argument must be of type
   string...`. This meant the primary dedup index silently never persisted
   to disk across plugin restarts. Fixed with `JSON.stringify(index)`.

4. **`archiveMemoAfterSync` defaulted to *on*.** [settings.ts:142](../src/settings.ts#L142)
   had `type: "boolean", default: "false"` — a non-empty **string**, which
   is truthy in JS. On a fresh install this setting would silently default
   to checked, meaning the first sync would archive every private memo on
   the user's server without them ever opting in. Changed to a real
   boolean `false`.

5. **`host` setting required a scheme the field description didn't
   mention.** The description said `example: memos.com:8080` (no
   scheme), but `clientV1.ts` does `new URL(`${this.host}/...`)` with no
   default-scheme fallback, and `configMigrate()` writes
   `host: memosUrl.origin` (which always includes a scheme) when migrating
   from the legacy `openAPI` field — so the two code paths disagreed with
   each other. A bare `memo.yanfosec.com:443` value (which is what the
   description told users to enter) makes `new URL()` mis-parse the string
   as an opaque non-http scheme, producing an immediate, opaque "Cannot
   connect to memos server" with no actionable detail. Fixed the
   description to say a full URL is required, and added a defensive
   `https://` prefix fallback in `clientV1.ts`'s constructor so a bare host
   still works.

6. **Full Sync reset silently no-op'd.** [memos.ts:109](../src/memos.ts#L109)'s
   `beforeSync()` wrote `lastSyncTimestamp: 0` via
   `saveSyncStatus(0)`, then `sync()` immediately re-read
   `lastSyncTimestamp()` from `logseq.settings` — which had not yet
   reflected the write (it round-trips through the host process
   asynchronously, not synchronously on `await updateSettings()` return).
   The reset was silently discarded and the sync proceeded exactly as an
   incremental sync would. Fixed by having `beforeSync()` return the reset
   value directly (`0`) instead of relying on a re-read; `sync()` now uses
   that return value when present.

### Confirmed: `searchExistsMemoLegacy` (the `DB.q` fallback) does NOT
### reliably find existing blocks on this DB graph

Section 8 flagged this as unverified; it's now confirmed **broken** in
practice, not just theoretically risky. Reproduced live: with the primary
`synced-memos.json` index empty (see bug 3 above) and two memos already
present as Logseq blocks with correct `memo-id` properties, running "Full
Sync" (`lastSyncTimestamp` reset to 0) caused the sync loop to check
`searchExistsMemoLegacy(memo.id)` for both, both returned `null` (not
found), and **both memos were inserted a second time as duplicate blocks**.

This means the DSL query `(or (property memoid "...") (property memo-id
"..."))` does not reliably match blocks on this Logseq 2.0.1 DB graph. The
practical implication: **dedup on this rebuild works only when the primary
`FileStorage` index (bug 3, now fixed) is actually populated for a given
memo.** New memos inserted from now on get added to the index correctly and
are safe. But any memo that was already a Logseq block *before* this
rebuild — i.e. synced by an older version of this plugin, or present in the
index-not-yet-written window before this session's fix — has no entry in
the new index and is exposed to duplication risk the next time
`lastSyncTimestamp` is reset to 0 (Full Sync, or a corrupted/lost
`syncStatus` setting). There is no code-level fix for this within this
plugin; `DB.q` behavior is a Logseq-side matter. Recommend either warning
users clearly in the "Full Sync" setting description that it can duplicate
pre-existing content, or (better, future work) doing a one-time backfill
pass that populates the index from existing `memo-id`-bearing blocks before
ever trusting the legacy fallback.

After the index-write fix (bug 3) took effect, a second Full Sync against
the *same* two memos correctly reported `Skipping existing memo ID` for
both (`processed: 2, inserted: 0`) — confirming the primary index, once
populated, is reliable. The background sync timer was also left running
for several hours during this session and consistently reported zero new
inserts on each tick, with no duplication.

### Live-verified end to end

- **Pull**: `Sync Memos` against a real server correctly fetched memos,
  inserted them as blocks with a working `memo-id` property (visible and
  queryable in the DB graph's property UI, confirmed by eye) and a
  correctly-rendered attachment link (`Epson_...pdf`), in Journal Grouped
  mode.
- **Dedup**: incremental syncs (normal `lastSyncTimestamp` cursor) and,
  once the index-write bug was fixed, Full Sync resets both correctly
  produce zero duplicate blocks for already-synced memos.
- **Push**: `createMemo` (POST) verified directly against the live server
  via `logseq.Net.request` — real memo created and returned with a valid
  `name`. (The in-editor `/memos: Send in ...` slash command itself was not
  exercised — synthetic keystroke automation could not reliably trigger
  Logseq's slash-command popup — but it calls the same `MemosSync.post()` →
  `createMemo()` path that was verified.)
- **Archive**: `updateMemo` (PATCH) with `state: ARCHIVED` verified
  directly against the live server — status 200, confirmed archived.
- **Toolchain**: `pnpm build` (tsc + vite) and `pnpm test` stayed green
  throughout, including after all fixes above.

### Still not exercised

- The in-editor slash command UI specifically (see Push note above) — the
  underlying `post()`/`createMemo()` code path is verified, but the
  command's registration-and-popup UX itself was not clicked through.
- `Custom Page` and plain `Journal` sync modes (only `Journal Grouped` was
  tested).
- `includeArchive` pulling archived memos back into Logseq.
- Settings-panel behavior under `Custom Page` mode and non-default
  `tagFilter`/`inboxName` values.
