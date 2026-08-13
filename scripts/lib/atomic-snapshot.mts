import { parseOperatorSnapshotPayload, type OperatorSnapshotPayload } from '../../src/lib/operator-snapshot'

/** Reads every operator table from the service-only one-statement MVCC snapshot RPC. */
export async function fetchAtomicOperatorSnapshot(
  url: string,
  serviceKey: string,
): Promise<OperatorSnapshotPayload> {
  const response = await fetch(`${url}/rest/v1/rpc/capture_operator_snapshot_v1`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`atomic snapshot RPC failed: ${response.status} ${raw.slice(0, 300)}`)
  }
  return parseOperatorSnapshotPayload(JSON.parse(raw))
}
