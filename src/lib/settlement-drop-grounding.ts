export interface SettlementDropGrounding {
  pipeline: 'scripts/grounded-line.mts'
  fact_block: string[]
  attempts: number
  residual_findings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Strictly parses the public grounding stamp shared by audit and compilation. */
export function parseSettlementDropGrounding(value: unknown, label: string): SettlementDropGrounding {
  if (!isRecord(value) || value.pipeline !== 'scripts/grounded-line.mts') {
    throw new Error(`${label} must carry the grounded-line pipeline stamp`)
  }
  const allowed = new Set(['pipeline', 'fact_block', 'attempts', 'residual_findings'])
  const unknown = Object.keys(value).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
  if (!Array.isArray(value.fact_block) || value.fact_block.length === 0) {
    throw new Error(`${label} fact_block must be a non-empty array`)
  }
  const factBlock = value.fact_block.map((fact, index) => {
    if (typeof fact !== 'string' || !fact.trim()) throw new Error(`${label} fact ${index + 1} is required`)
    return fact
  })
  if (!Number.isInteger(value.attempts) || (value.attempts as number) < 1) {
    throw new Error(`${label} attempts must be an integer of at least 1`)
  }
  if (!Array.isArray(value.residual_findings)) {
    throw new Error(`${label} residual_findings must be an array`)
  }
  if (value.residual_findings.length > 0) throw new Error(`${label} is blocked by residual grounding findings`)
  return {
    pipeline: 'scripts/grounded-line.mts',
    fact_block: factBlock,
    attempts: value.attempts as number,
    residual_findings: [],
  }
}

export function isSettlementDropGrounding(value: unknown): value is SettlementDropGrounding {
  try {
    parseSettlementDropGrounding(value, 'grounding')
    return true
  } catch {
    return false
  }
}
