# Vendored Fandom Core snapshot

`vendor/fandom-core/` is a reviewed, commit-pinned snapshot of the reusable
knowledge owned by the private
[`fedickinson/fandom-core`](https://github.com/fedickinson/fandom-core)
repository. It lets this public product build in CI and Vercel without a
cross-repository credential. The snapshot contains only knowledge and metadata
already present in this public repository; portrait binaries remain under
`public/avatars/characters/`.

The lock in `fandom-core.lock.json` records the exact private commit, package
version, included files and SHA-256 digests. Runtime lore adapters, legacy
dossier authoring and entity portrait selection read from this snapshot. Live
rooms still read their immutable, room-bound Supabase show pack.

Check the committed snapshot without network access:

```text
npm run fandom:check
```

Update it from an authenticated, clean Fandom Core checkout:

```text
npm run fandom:sync -- --source /path/to/fandom-core
```

Synchronization is explicit. It never follows the private repository's latest
branch at runtime, and the check fails on file, possibility, portrait or lock
drift. Review and commit the resulting product changes normally.
