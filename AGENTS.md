## Agent skills

### Issue tracker

Issues live in GitHub Issues at `K4F7/cms` (`gh` CLI). Koishi / Yakumo / Archive-read tickets stay in `K4F7/memebot`. Frontend work is labelled `frontend`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Push flow

Done issue → open PR → `gh pr merge --auto --squash`. `main` waits for `baseline` CI. See `docs/agents/push-flow.md`.

### Dokploy release

CI pins `CMS_IMAGE_TAG` (and syncs `APP_VERSION`) to the full git sha, drops stale `CMS_IMAGE_DIGEST`, and calls `compose.deploy`. See `docs/agents/dokploy-deploy.md`.
