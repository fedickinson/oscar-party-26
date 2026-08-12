import { describe, expect, it, vi } from 'vitest'
import type { GroundingModelCaller } from '../../api/_grounding'
import { groundedLine } from '../../scripts/grounded-line.mts'
import {
  buildGroundedLineAuditModelRequest,
  buildGroundedLineModelRequest,
} from './grounded-line-contract'

const input = {
  speaker: 'Cersei',
  voice: 'Voice: Cersei\nExpression instruction: Judge power precisely.',
  facts: ['Aegon was alive.', 'No fire was used.'],
  angle: 'Judge the delegation, not an invented method.',
}

describe('grounded-line runtime contract', () => {
  it('sends the same initial and audit requests exposed by the review contract', async () => {
    const caller = vi.fn<GroundingModelCaller>()
      .mockResolvedValueOnce('{"text":"A living king remains a political fact."}')
      .mockResolvedValueOnce('{"violations":[]}')

    await expect(groundedLine({ ...input, caller })).resolves.toEqual({
      text: 'A living king remains a political fact.',
      attempts: 1,
      lastViolations: [],
    })
    expect(caller).toHaveBeenNthCalledWith(1, buildGroundedLineModelRequest(input))
    expect(caller).toHaveBeenNthCalledWith(2, buildGroundedLineAuditModelRequest(
      'A living king remains a political fact.',
      input.facts,
    ))
  })

  it('sends auditor findings through the exact retry request builder', async () => {
    const findings = ['The method is absent from the facts.']
    const caller = vi.fn<GroundingModelCaller>()
      .mockResolvedValueOnce('{"text":"He won by fire."}')
      .mockResolvedValueOnce(JSON.stringify({ violations: findings }))
      .mockResolvedValueOnce('{"text":"He remains alive."}')
      .mockResolvedValueOnce('{"violations":[]}')

    await groundedLine({ ...input, caller })

    expect(caller).toHaveBeenNthCalledWith(3, buildGroundedLineModelRequest(input, findings))
  })
})
