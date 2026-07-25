module.exports = {
  tagFormat: "v${version}",
  branches: ["main"],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [{ type: "chore", release: "patch" }],
      },
    ],
    // The preset must match commit-analyzer's. Without it this defaults to
    // the angular preset, whose header pattern does not accept the "!"
    // breaking-change marker — "feat!: ..." then fails to parse and is
    // dropped from the notes entirely, producing an empty release body.
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
      },
    ],
    "@semantic-release/changelog",
    // Must run before the zip below: Logseq reads the plugin version from the
    // packaged package.json, so it has to be bumped before the zip is built.
    // npmPublish is false — this plugin is distributed via the Logseq
    // marketplace and GitHub Releases, not npm.
    [
      "@semantic-release/npm",
      {
        npmPublish: false,
      },
    ],
    [
      "@semantic-release/exec",
      {
        prepareCmd:
          "zip -qq -r logseq-memos-sync-db-${nextRelease.version}.zip dist readme.md logo.webp LICENSE package.json",
      },
    ],
    // Persist the version/changelog bumps back to main. Without this the
    // repo drifts from its own tags (the upstream project's package.json
    // said 1.3.1 while its tags had reached v1.9.3).
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "CHANGELOG.md"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    [
      "@semantic-release/github",
      {
        assets: "logseq-memos-sync-db-*.zip",
      },
    ],
  ],
};
