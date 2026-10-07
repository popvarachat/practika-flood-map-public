# GitHub Pages Release Policy

This repository uses **manual, single-job GitHub Pages deployment** for cost and run-efficiency control.

## Working mode
- Work and commit on `main`.
- Pushes to `main` do **not** publish automatically.
- Batch related edits, tests, and fixes before release.
- Do not re-enable branch-based Pages deployment.

## Production release
Release only after validation / Human Gate:

```powershell
gh workflow run publish-pages.yml -R popvarachat/practika-flood-map-public --ref main
```

The workflow:
- runs only on `workflow_dispatch`
- uses one `ubuntu-slim` job
- uploads only the static site
- keeps the Pages artifact for 1 day
- deploys the approved `main` snapshot

One approved release = one Pages workflow run. Avoid repeated release calls for the same commit.
