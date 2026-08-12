import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertRasterAssetMatchesPath } from '../../src/lib/raster-asset'
import type { ShowPack } from '../../src/lib/show-pack'

const DEFAULT_PUBLIC_ROOT = fileURLToPath(new URL('../../public/', import.meta.url))

/**
 * Proves that every compiled portrait resolves inside this deployment's public
 * tree and still has the digest reviewed in the show pack.
 */
export function verifyShowPackPortraitAssets(
  pack: ShowPack,
  publicRoot = DEFAULT_PUBLIC_ROOT,
): void {
  const root = realpathSync(publicRoot)
  for (const entity of pack.entities) {
    const requested = resolve(root, `.${entity.portrait.path}`)
    let actual: string
    try {
      actual = realpathSync(requested)
    } catch {
      throw new Error(`entity ${entity.id} portrait does not exist: ${entity.portrait.path}`)
    }
    const fromRoot = relative(root, actual)
    if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) {
      throw new Error(`entity ${entity.id} portrait escapes the public asset root`)
    }
    if (!statSync(actual).isFile()) {
      throw new Error(`entity ${entity.id} portrait is not a file: ${entity.portrait.path}`)
    }
    const bytes = readFileSync(actual)
    try {
      assertRasterAssetMatchesPath(entity.portrait.path, bytes)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`entity ${entity.id} ${message}`)
    }
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== entity.portrait.sha256) {
      throw new Error(
        `entity ${entity.id} portrait hash mismatch: expected ${entity.portrait.sha256}, got ${digest}`,
      )
    }
  }
}
