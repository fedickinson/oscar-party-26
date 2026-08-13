import { randomUUID } from 'node:crypto'
import {
  existsSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  realpathSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export interface ProtectedSource {
  label: string
  path: string
}

/** Resolves symlinks in the nearest existing ancestor of a future output. */
export function canonicalProspectivePath(path: string): string {
  const absolute = resolve(path)
  const missing: string[] = []
  let ancestor = absolute
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor)
    if (parent === ancestor) throw new Error(`no existing ancestor for output path ${absolute}`)
    missing.unshift(basename(ancestor))
    ancestor = parent
  }
  return join(realpathSync(ancestor), ...missing)
}

/** Refuses aliases as well as equal path strings: symlinks and hard links share file identity. */
export function assertOutputDoesNotAliasSource(
  outputPath: string,
  protectedSources: ProtectedSource[],
): void {
  if (!existsSync(outputPath)) return
  const output = statSync(outputPath)
  const source = protectedSources.find((candidate) => {
    if (!existsSync(candidate.path)) return false
    const identity = statSync(candidate.path)
    return identity.dev === output.dev && identity.ino === output.ino
  })
  if (source) throw new Error(`refusing to overwrite ${source.label}`)
}

/**
 * Non-forced creation uses the filesystem's exclusive-create gate. Forced
 * replacement writes a sibling first, then renames it over the destination, so
 * an existing symlink or hard link is replaced rather than followed.
 */
export function writeUtf8FileSafely(
  path: string,
  contents: string,
  force: boolean,
  mode = 0o666,
): void {
  if (!force) {
    writeFileSync(path, contents, { encoding: 'utf8', flag: 'wx', mode })
    return
  }

  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, contents, { encoding: 'utf8', flag: 'wx', mode })
    renameSync(temporary, path)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}
