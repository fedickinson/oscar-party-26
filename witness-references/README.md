# Witness reference manifest

The AI witness never publishes or uploads a show's recognition portraits to
Supabase. The operator keeps a manifest and its images in a gitignored local
directory, normally `.private/witness/`.

```json
{
  "schema_version": 1,
  "show_pack": {
    "key": "example-show-finale",
    "version": 1
  },
  "references": [
    {
      "entity_key": "the-captain",
      "images": ["portraits/the-captain-front.webp", "portraits/the-captain-side.webp"]
    }
  ]
}
```

`entity_key` is the exact `pack_key` installed on the canonical draft entity.
Each entity may carry one to three GIF, JPEG, PNG or WebP files. Paths are
relative to the manifest and must remain inside its directory; absolute paths,
parent traversal and symlink escapes fail closed. A signature beat is eligible
only when every one of its entities has a reference entry.

Plan mode validates the manifest, image formats, byte ceilings, room pack and
undeclared reviewed board without contacting Anthropic or writing Supabase.
See the Layer 4 section of `RUNBOOK.md` for the explicit send command.

Host review is a separate authority boundary. The operator provisions one
room-scoped capability with `scripts/issue-operator-capability.mts`, then opens
the generated gitignored phone-link file on the host device. The bearer lives
only in the URL fragment long enough for the app to store it under that room ID
and scrub the visible URL. Public room and host IDs are insufficient. Never add
the generated `.token` or `.url` files to this directory or any tracked source.
