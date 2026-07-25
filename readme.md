# logseq-memos-sync-db

> A Memos sync plugin for Logseq 2.0.1+ (DB-graph)

This is a DB-graph-compatible continuation of
[EINDEX's logseq-memos-sync](https://github.com/EINDEX/logseq-memos-sync),
which was archived after its original author stopped using Memos. This fork
rewrites the plugin against the current Memos API and Logseq 2.0.1's
`@logseq/libs` 0.3.4 SDK — see [docs/UPGRADE_PLAN.md](docs/UPGRADE_PLAN.md)
for the full audit and live-test writeup of what changed and why.

> [!IMPORTANT]
> Requires **Logseq 2.0.1 or later** (the database-graph app). This does not
> work with Logseq OG / the legacy file-graph fork — use the original
> [logseq-memos-sync](https://github.com/EINDEX/logseq-memos-sync) for that.

## Features

- Sync memos to Logseq via the Memos API
- Auto Sync memos when Logseq starts
- Send a Logseq block to Memos
- Sync memos filtered by tag
- Includes attachments (rendered as links)

## Installation

Not yet in the Logseq marketplace. To install manually:

1. Download `logseq-memos-sync-db-<version>.zip` from the
   [Releases](https://github.com/yanfosec/logseq-memos-sync-db/releases)
   page and unzip it.
2. In Logseq, enable Developer mode (Settings → Advanced).
3. Go to Settings → Plugins → **Load unpacked plugin** and select the
   unzipped folder.

## How to use

1. Open the plugin settings and set the Memos server URL (full URL
   including `https://`, e.g. `https://memos.example.com`) and API token.

### Manually Sync

1. Open the Logseq command palette: Win `Ctrl + Shift + P` or macOS
   `Command + Shift + P`.
2. Search for "Sync Memos".
3. Run it.

### Automatic Sync

1. Open the plugin settings and enable `Auto Sync`.

## Limitations

- If a memo already exists in Logseq, its content is not overwritten on
  re-sync — we don't want to clobber your edits.
- Images and files are linked, not downloaded/embedded, between Memos and
  Logseq.

> [!WARNING]
> **"Full Sync" can duplicate memos that were synced by the 1.x plugin.**
> Duplicate detection relies on an index this version maintains. Memos
> already in your graph from an older version aren't in that index, and the
> fallback lookup (a `logseq.DB.q` property query) does not reliably match
> blocks on DB graphs — this was confirmed against a live 2.0.1 graph, see
> [docs/UPGRADE_PLAN.md](docs/UPGRADE_PLAN.md) §9. Memos synced by *this*
> version are tracked correctly and are unaffected. If you're migrating,
> avoid Full Sync, or expect to clean up duplicates once.

## Screenshots

![](docs/memos.png)

![](docs/logseq.png)

## Self Checking

If sync doesn't seem to be working, check:

- Your Memos server is reachable from Logseq, and the host field includes
  the scheme (`https://...`).
- Whether a memo already has a `memo-id` property — you can check via:
  `{{query (or (property memoid) (property memo-id))}}`

## Thanks

- [Memos](https://github.com/usememos/memos)
- [EINDEX](https://github.com/EINDEX) for the original
  [logseq-memos-sync](https://github.com/EINDEX/logseq-memos-sync) this
  project is built on.

## License

GPL-3.0, inherited from the original project. See [LICENSE](LICENSE).
