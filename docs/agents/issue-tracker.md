# Issue tracker: GitHub

Content-platform issues live in GitHub Issues at `K4F7/cms`. Use the `gh` CLI
for all operations. Infer the repository from `git remote -v` when commands
run inside this clone.

Koishi plugin, Yakumo, and Archive read-adapter tickets stay in
[`K4F7/memebot`](https://github.com/K4F7/memebot/issues).

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Add a label: `gh issue edit <number> --add-label "..."`
- Remove a label: `gh issue edit <number> --remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

## Wayfinding

- Child tickets use `wayfinder:<type>`, where type is `research`, `prototype`,
  `grilling`, or `task`.
- Prefer GitHub sub-issues and native issue dependencies.
- If those features are unavailable, use task lists and a `Blocked by: #<number>`
  line.
- Claim a ticket with `gh issue edit <number> --add-assignee @me`.
- Resolve it by commenting with the result and closing the issue.
