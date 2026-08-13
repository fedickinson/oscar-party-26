import {
  assertStableOperatorSnapshotSchema,
  canonicalizeOperatorSnapshotSchema,
  type OperatorSnapshotPayload,
} from '../../src/lib/operator-snapshot'
import { fetchAtomicOperatorSnapshot } from './atomic-snapshot.mts'

export async function fetchCanonicalOperatorSchema(
  url: string,
  serviceKey: string,
): Promise<string> {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/openapi+json',
    },
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`operator schema read failed: ${response.status}`)
  return canonicalizeOperatorSnapshotSchema(raw)
}

export async function captureStableOperatorSnapshot(
  url: string,
  serviceKey: string,
): Promise<{ schema: string; payload: OperatorSnapshotPayload }> {
  const before = await fetchCanonicalOperatorSchema(url, serviceKey)
  const payload = await fetchAtomicOperatorSnapshot(url, serviceKey)
  const after = await fetchCanonicalOperatorSchema(url, serviceKey)
  assertStableOperatorSnapshotSchema(before, after)
  return { schema: before, payload }
}
