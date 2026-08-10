---
name: ship-change
description: Land completed work — commit, push, open a PR, merge, or deploy to production with Vercel, including mid-show hotfixes. Checks the branch against the remote for both unexpected scope and supersession, runs the build gate, stages explicit paths, and stops at the authority boundary the user actually granted. Use only when the user asked for that specific step; implementing a change never implies shipping it.
---

# Ship a change

Shipping is a separate operation with its own authority boundary. Do only the step the user asked
for: "commit" is not "push", "push" is not "deploy", and nothing here implies a merge.

## Readiness

1. **Fetch first.** `git fetch origin`, then compare the branch against the authoritative remote
   base. Look both ways: extra commits or files you did not intend to land, and upstream work that
   supersedes yours.
2. **Review the exact payload.** `git status` and `git diff` — confirm every file that will land is
   one you meant to change, and that unrelated in-progress work stays out of the commit.
3. **Run the gate.** `npm run build` and `npm test`. Nothing ships red. If the change touched
   backend writes, `npx tsx scripts/dogfood-e2e.mts` too. Report the exact scope you ran — the
   suite is pure-function only, so a green run is not evidence about a screen.
4. **Security pass.** This repository is public and the database is production. Before staging,
   confirm no key, password, connection string, `.env` value, snapshot, or private-doc content is
   in the diff. Auth, RLS policy, credential, destructive-migration, and personal-data changes get
   a separate explicit review before they land — say so and wait.

## Staging and committing

- Stage **explicit paths**. Never `git add -A` or `git add .`; the working tree routinely holds
  unrelated work.
- Commit message: the repo's convention is a lowercase `type: subject` line (`feat:`, `fix:`,
  `docs:`, `chore:`, `doctrine:`) written as what changed and why it mattered. No emoji.
- Do not amend or rebase published commits without being asked.

## Deploying

`npx vercel --prod`. Then remember what a deploy does not do:

- **Open tabs do not reload.** Players must pull to refresh. Tell the host to post it in chat.
- **Mixed versions talk to one database** until the last phone refreshes, so anything shipped
  mid-game must be backward compatible: additive columns only, no renames, drops, retypes, or
  repurposed meanings. Destructive migrations wait until the day after.
- **Rollback is an alias, not a redeploy**: `npx vercel ls`, then
  `npx vercel alias set <good-url> <domain>` — seconds, and every deploy of the night is a
  rollback menu.

Before any mid-show deploy, take a snapshot: `npx tsx scripts/snapshot-game.mts`.

Applying a migration to the live project, aliasing production, deleting branches, or touching a
room with real people in it all require the user's explicit go-ahead — ask, do not infer.

## Output

What landed: commit SHAs, files, branch, and the remote state. What was run and at what scope.
Deployment URL if one was created. Then offer exactly one bounded cleanup action for any branch,
worktree, or background process you created — and wait for the answer.
