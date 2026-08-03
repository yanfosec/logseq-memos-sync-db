## [2.0.4](https://github.com/yanfosec/logseq-memos-sync-db/compare/v2.0.3...v2.0.4) (2026-08-03)


### Bug Fixes

* give a clear error when the Memos API returns HTML instead of JSON ([#6](https://github.com/yanfosec/logseq-memos-sync-db/issues/6)) ([7f78bc0](https://github.com/yanfosec/logseq-memos-sync-db/commit/7f78bc0188a34353de2945ebecafea614bb8d9d0))

## [2.0.3](https://github.com/yanfosec/logseq-memos-sync-db/compare/v2.0.2...v2.0.3) (2026-08-03)


### Bug Fixes

* strip trailing slash from Memos host to prevent HTML-instead-of-JSON sync failure ([#5](https://github.com/yanfosec/logseq-memos-sync-db/issues/5)) ([328d101](https://github.com/yanfosec/logseq-memos-sync-db/commit/328d101f81f7d146bad323ee8f2283edfb172fb9))

## [2.0.2](https://github.com/yanfosec/logseq-memos-sync-db/compare/v2.0.1...v2.0.2) (2026-07-31)

## [2.0.1](https://github.com/yanfosec/logseq-memos-sync-db/compare/v2.0.0...v2.0.1) (2026-07-31)


### Bug Fixes

* **push:** stamp pushed memos with their Logseq date ([#1](https://github.com/yanfosec/logseq-memos-sync-db/issues/1)) ([0fd27c1](https://github.com/yanfosec/logseq-memos-sync-db/commit/0fd27c1f2533c2efd04d231a21f8f81895682df9))

# [2.0.0](https://github.com/yanfosec/logseq-memos-sync-db/compare/v1.10.1...v2.0.0) (2026-07-25)

First release of `logseq-memos-sync-db`, a continuation of
[EINDEX/logseq-memos-sync](https://github.com/EINDEX/logseq-memos-sync)
targeting Logseq 2.0.1+ database graphs. See
[docs/UPGRADE_PLAN.md](docs/UPGRADE_PLAN.md) for the full audit and
live-test writeup.

### ⚠ BREAKING CHANGES

* **Requires Logseq 2.0.1 or later** (database graphs). This release does
  not work on Logseq OG / file graphs — stay on the original plugin for
  those.
* **Memos API v0 support removed.** The v1 client is the only client; v0
  has been EOL for a long time and was already dead code.
* **New plugin id** (`_yanfosec-logseq-memos-sync-db`). This installs
  alongside the original plugin rather than upgrading it in place.

### Features

* Rewritten against `@logseq/libs` 0.3.4, the DB-graph SDK.
* All HTTP now goes through `logseq.Net`, which proxies through the Logseq
  host process. Logseq 2.0.1 runs plugins in a sandboxed `lsp://` iframe
  subject to browser CORS, which blocked every request to Memos servers
  that don't send CORS headers.
* Duplicate detection now uses a `FileStorage`-backed index rather than
  relying solely on a graph property query.
* Client updated to the current Memos API: `updateMask` on PATCH, `state`
  instead of `row_status`, `attachments` instead of `resources`, and
  string memo ids instead of a hashed numeric shim.

### Bug Fixes

* Plugin no longer crashes on load when `sendVisibility` is unset, which
  was silently aborting slash-command registration and auto-sync.
* Dedup index now actually persists (`FileStorage.setItem` requires a
  string; it was being handed an object and failing silently).
* "Archive memo after sync" no longer defaults to on. It was a truthy
  string `"false"`, so a fresh install would archive private memos on the
  first sync.
* "Full Sync" now actually resets the sync cursor instead of silently
  reusing the previous timestamp.
* Server URLs entered without a scheme no longer fail with an opaque
  connection error.

### Known Issues

* **"Full Sync" can duplicate memos that were synced by the 1.x plugin.**
  Those memos aren't in this version's index, and the fallback
  `logseq.DB.q` property lookup does not reliably match blocks on DB
  graphs. Memos synced by this version are tracked correctly. See
  [docs/UPGRADE_PLAN.md](docs/UPGRADE_PLAN.md) §9.

## [1.3.1](https://github.com/EINDEX/logseq-memos-sync/compare/v1.3.0...v1.3.1) (2023-03-05)


### Bug Fixes

* release a fix version ([eaf6b3d](https://github.com/EINDEX/logseq-memos-sync/commit/eaf6b3d687182bbc0a0f889a32d2b220d8933874))

# [1.3.0](https://github.com/EINDEX/logseq-memos-sync/compare/v1.2.0...v1.3.0) (2023-03-05)


### Bug Fixes

* for release ([3ca72b6](https://github.com/EINDEX/logseq-memos-sync/commit/3ca72b6aebc8ff0e41fcdfb3547b7424e7920deb))
* fuck the force push ([3a89619](https://github.com/EINDEX/logseq-memos-sync/commit/3a89619871fe0f6f4ba4e08c412ea620bdfb103e))
* fuck the force push ([90464cc](https://github.com/EINDEX/logseq-memos-sync/commit/90464ccbea148ce004eda57b9e4eaa2e59884ad5))
* fuck the force push ([40338c0](https://github.com/EINDEX/logseq-memos-sync/commit/40338c020228a92b7063dae5dd5e5b421b8cdbe8))
* handle send memos content from logseq ([09f5231](https://github.com/EINDEX/logseq-memos-sync/commit/09f5231a5dc47a59622e1aefc46d77933e848ec1)), closes [#5](https://github.com/EINDEX/logseq-memos-sync/issues/5)
* make stable of group sync ([ce5df1f](https://github.com/EINDEX/logseq-memos-sync/commit/ce5df1fac6ffb918233f3a572f4dee0f3106b6c4))
* makeing a fix version ([a0914d8](https://github.com/EINDEX/logseq-memos-sync/commit/a0914d8c7cc1dc65d1138a73870d395ea85a1106))


### Features

* add publish memos from logseq ([473dad3](https://github.com/EINDEX/logseq-memos-sync/commit/473dad38906eb141c1be3228f19452b4ec108433))
* add tag filter sync ([cb84cb6](https://github.com/EINDEX/logseq-memos-sync/commit/cb84cb690210b3f6e81188e9808a6f0675bd0639))
* marge feat group message and archive after sync ([abd939f](https://github.com/EINDEX/logseq-memos-sync/commit/abd939f51c7a2d1af4f3cb4836174c2d6ad8683d))
* **sync:** add update memos ([5ef425e](https://github.com/EINDEX/logseq-memos-sync/commit/5ef425e3a5f2db5822b671401e9226eee2c2323d))

# [1.3.0](https://github.com/EINDEX/logseq-memos-sync/compare/v1.2.0...v1.3.0) (2023-03-05)


### Bug Fixes

* for release ([3ca72b6](https://github.com/EINDEX/logseq-memos-sync/commit/3ca72b6aebc8ff0e41fcdfb3547b7424e7920deb))
* fuck the force push ([90464cc](https://github.com/EINDEX/logseq-memos-sync/commit/90464ccbea148ce004eda57b9e4eaa2e59884ad5))
* fuck the force push ([40338c0](https://github.com/EINDEX/logseq-memos-sync/commit/40338c020228a92b7063dae5dd5e5b421b8cdbe8))
* handle send memos content from logseq ([09f5231](https://github.com/EINDEX/logseq-memos-sync/commit/09f5231a5dc47a59622e1aefc46d77933e848ec1)), closes [#5](https://github.com/EINDEX/logseq-memos-sync/issues/5)
* make stable of group sync ([ce5df1f](https://github.com/EINDEX/logseq-memos-sync/commit/ce5df1fac6ffb918233f3a572f4dee0f3106b6c4))
* makeing a fix version ([a0914d8](https://github.com/EINDEX/logseq-memos-sync/commit/a0914d8c7cc1dc65d1138a73870d395ea85a1106))


### Features

* add publish memos from logseq ([473dad3](https://github.com/EINDEX/logseq-memos-sync/commit/473dad38906eb141c1be3228f19452b4ec108433))
* add tag filter sync ([cb84cb6](https://github.com/EINDEX/logseq-memos-sync/commit/cb84cb690210b3f6e81188e9808a6f0675bd0639))
* marge feat group message and archive after sync ([abd939f](https://github.com/EINDEX/logseq-memos-sync/commit/abd939f51c7a2d1af4f3cb4836174c2d6ad8683d))
* **sync:** add update memos ([5ef425e](https://github.com/EINDEX/logseq-memos-sync/commit/5ef425e3a5f2db5822b671401e9226eee2c2323d))

# [1.2.0](https://github.com/EINDEX/logseq-memos-sync/compare/v1.1.0...v1.2.0) (2023-02-28)


### Features

* support background sync ([2888da4](https://github.com/EINDEX/logseq-memos-sync/commit/2888da46c4f366871224f4ad9c39026e06bfe274))

# [1.1.0](https://github.com/EINDEX/logseq-memos-sync/compare/v1.0.2...v1.1.0) (2023-02-02)


### Features

* auto sync memos when start logseq ([c2e3d38](https://github.com/EINDEX/logseq-memos-sync/commit/c2e3d3816b3f03c6d58eff4735068343b3a79839))

## [1.0.2](https://github.com/EINDEX/logseq-memos-sync/compare/v1.0.1...v1.0.2) (2022-12-02)


### Bug Fixes

* **package:** image cannot load ([32d78cf](https://github.com/EINDEX/logseq-memos-sync/commit/32d78cf5e2366f0a2565e084a419cdf47c2edb25))

## [1.0.1](https://github.com/EINDEX/logseq-memos-sync/compare/v1.0.0...v1.0.1) (2022-12-01)


### Bug Fixes

* **release:** fix release zip file name ([339f3cb](https://github.com/EINDEX/logseq-memos-sync/commit/339f3cb1b2dc20929f93730300c30002594f3e14))

# 1.0.0 (2022-12-01)


* build!: build logseq-memos-plugin ([78a2506](https://github.com/EINDEX/logseq-memos-sync/commit/78a2506f47fbf328b7a8014c8866ccbe0892a113))


### BREAKING CHANGES

* New Logseq Plugin.

## [2.1.1](https://github.com/pengx17/logseq-plugin-template-react/compare/v2.1.0...v2.1.1) (2022-03-24)


### Bug Fixes

* revert bot pr ([59527a7](https://github.com/pengx17/logseq-plugin-template-react/commit/59527a7044bec0ddd17a79de54844730e8a591a4))

# [2.1.0](https://github.com/pengx17/logseq-plugin-template-react/compare/v2.0.1...v2.1.0) (2022-03-24)


### Bug Fixes

* remove unused line ([0d69a50](https://github.com/pengx17/logseq-plugin-template-react/commit/0d69a504e4847b4859377ada65766b887920ae38))
* update logseq-dev-plugin ([36a69f7](https://github.com/pengx17/logseq-plugin-template-react/commit/36a69f7f13789cd86156273dbf8c01fad793b3e1))


### Features

* use vite-plugin-logseq ([54aa154](https://github.com/pengx17/logseq-plugin-template-react/commit/54aa154615eafa9af8727d0fc1f3031c5e610aa7))

## [2.0.1](https://github.com/pengx17/logseq-plugin-template-react/compare/v2.0.0...v2.0.1) (2022-03-21)


### Bug Fixes

* add missing base for production build ([738ac09](https://github.com/pengx17/logseq-plugin-template-react/commit/738ac09dab9785ccc3564117bc4026cfb4464e9a))

# [2.0.0](https://github.com/pengx17/logseq-plugin-template-react/compare/v1.0.0...v2.0.0) (2022-03-17)

# 1.0.0 (2021-09-03)


### Bug Fixes

* build ([fd35d6c](https://github.com/pengx17/logseq-plugin-template-react/commit/fd35d6c098e030920da26a65c734940a27b604df))
* deps ([7ad5f35](https://github.com/pengx17/logseq-plugin-template-react/commit/7ad5f351a645029823c3ab4cc04db2476948943a))
* useAppVisible hook ([0f3ad46](https://github.com/pengx17/logseq-plugin-template-react/commit/0f3ad46e2fe8f9326e796fb50f8f32d5c66d9bf8))


### Features

* enable HMR ([7ff7100](https://github.com/pengx17/logseq-plugin-template-react/commit/7ff7100552180c6d14f3df37a449b704da29270d))
