import { LEGACY_SHOW_PACK_ID } from './catalog-scope'

export type RuntimeNarrativeMode = 'legacy_live_cast' | 'pack_commentary_only'

/**
 * The deployed browser and daemon cast carries legacy property canon. Until a
 * compiled pack owns an equivalent runtime projection, every other room fails
 * closed before model work and uses only factory-authored grounded commentary.
 */
export function resolveRuntimeNarrativeMode(
  showPackId: string | null | undefined,
): RuntimeNarrativeMode {
  return showPackId === LEGACY_SHOW_PACK_ID
    ? 'legacy_live_cast'
    : 'pack_commentary_only'
}
