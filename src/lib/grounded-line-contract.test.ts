import { describe, expect, it } from 'vitest'
import {
  buildGroundedLineAuditModelRequest,
  buildGroundedLineModelRequest,
  buildGroundedLinePromptContract,
  groundedLinePromptContractSha256,
} from './grounded-line-contract'

const input = {
  speaker: 'Cersei',
  voice: 'Voice: Cersei\nExpression instruction: Judge power precisely.',
  facts: ['Aegon was alive.', 'No fire was used.'],
  angle: 'Judge the delegation, not an invented method.',
}

describe('grounded-line prompt contract', () => {
  it('projects the exact initial request and fixed retry policy for inspection', () => {
    const contract = buildGroundedLinePromptContract(input)

    expect(contract).toMatchObject({
      contract_version: 1,
      pipeline: 'scripts/grounded-line.mts',
      length_hint: 'One or two short sentences.',
      max_retries: 2,
      transport: {
        provider: 'anthropic',
        api_version: '2023-06-01',
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
        system_cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    })
    expect(contract.initial_model_request).toEqual(buildGroundedLineModelRequest(input))
    expect(contract.initial_model_request.user).toContain('1. Aegon was alive.\n2. No fire was used.')
    expect(contract.initial_model_request.user).not.toContain('PREVIOUS ATTEMPT WAS REJECTED')
    expect(groundedLinePromptContractSha256(input)).toMatch(/^[a-f0-9]{64}$/)
    expect(groundedLinePromptContractSha256(input)).toBe(
      groundedLinePromptContractSha256(structuredClone(input)),
    )
  })

  it('projects audit and retry templates through the same runtime builders', () => {
    const contract = buildGroundedLinePromptContract(input)

    expect(contract.audit_model_request_template).toEqual(
      buildGroundedLineAuditModelRequest('{{GENERATED_LINE}}', input.facts),
    )
    expect(contract.retry_model_request_template).toEqual(
      buildGroundedLineModelRequest(input, ['{{AUDIT_FINDINGS}}']),
    )
  })
})
