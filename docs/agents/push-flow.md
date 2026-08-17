# Push flow

When an issue is done, ship it — do not wait for a separate human review gate.

## Steps

1. Finish the issue on a branch (prefer `issue/<n>-…`).
2. Push the branch and open a PR that closes the issue (`Closes #<n>`).
3. Queue auto-merge: `gh pr merge --auto --squash`.
4. `main` requires the `baseline` check from `.github/workflows/verify.yml`. Auto-merge lands only after that check is green.

Do not merge manually while required checks are still running or failing. If auto-merge cannot queue (permissions / missing required checks), wait for `baseline` to pass, then merge.
