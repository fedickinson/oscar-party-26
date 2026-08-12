import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  canonicalProspectivePath,
  writeUtf8FileSafely,
} from '../../scripts/lib/safe-write.mts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function scratchFile(): string {
  const root = mkdtempSync(join(tmpdir(), 'safe-write-mode-'))
  roots.push(root)
  return join(root, 'secret.txt')
}

describe('writeUtf8FileSafely creation mode', () => {
  it('creates a new secret with its restrictive mode on the first inode', () => {
    const path = scratchFile()
    writeUtf8FileSafely(path, 'secret\n', false, 0o600)

    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(readFileSync(path, 'utf8')).toBe('secret\n')
  })

  it('creates the forced replacement inode with the restrictive mode', () => {
    const path = scratchFile()
    writeFileSync(path, 'old\n', { mode: 0o644 })
    writeUtf8FileSafely(path, 'new\n', true, 0o600)

    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(readFileSync(path, 'utf8')).toBe('new\n')
  })
})

describe('canonicalProspectivePath', () => {
  it('recognizes equal future destinations through symlinked parent directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'safe-write-destination-'))
    roots.push(root)
    const actual = join(root, 'actual')
    const alias = join(root, 'alias')
    mkdirSync(actual)
    symlinkSync(actual, alias)

    expect(canonicalProspectivePath(join(alias, 'packet.json')))
      .toBe(canonicalProspectivePath(join(actual, 'packet.json')))
  })

  it('canonicalizes through the nearest existing ancestor for new nested directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'safe-write-future-'))
    roots.push(root)

    expect(canonicalProspectivePath(join(root, 'new', 'nested', 'packet.json')))
      .toBe(join(realpathSync(root), 'new', 'nested', 'packet.json'))
  })
})
