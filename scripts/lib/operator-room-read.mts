import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchAllRows } from '../../src/hooks/fetch-all-rows'
import { normalizeOperatorCapability } from '../../src/lib/operator-capability'
import { buildRoomRuntimeNarrativeCast } from '../../src/lib/runtime-narrative'
import type { RoomPhase } from '../../src/types/database'
import { supabaseConfig, type Target } from './env.mts'

export interface OperatorRoom {
  id: string
  code: string
  phase: RoomPhase
  host_id: string | null
  active_settlement_id: string | null
  show_pack_id: string
}

export interface OperatorRoomPlayer {
  id: string
  name: string
  team: string | null
  is_host: boolean
}

export interface OperatorRoomMessage {
  id: string
  room_id: string
  player_id: string
  text: string
  created_at: string
}

export interface OperatorRoomCard {
  id: string
  player_id: string
}

export interface OperatorRoomMark {
  id: string
  card_id: string
}

export interface OperatorRoomHeartbeat {
  room_id: string
  engine: 'companion_daemon'
  instance_id: string
  started_at: string
  heartbeat_at: string
}

export interface OperatorQueueRead {
  count: number
  error: string | null
}

export interface OperatorRoomObservation {
  observed_at_ms: number
  room: OperatorRoom
  players: OperatorRoomPlayer[]
  messages: OperatorRoomMessage[]
  winner_count: number
  cards: OperatorRoomCard[]
  marks: OperatorRoomMark[]
  heartbeat: OperatorRoomHeartbeat | null
  grounding_queue: OperatorQueueRead
  witness_queue: OperatorQueueRead
  runtime_cast_ids: string[]
}

export function createOperatorRoomReader(defaultTarget: Target = 'remote') {
  const config = supabaseConfig(defaultTarget)
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    'Content-Type': 'application/json',
  }

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    })
    const body = await response.text()
    if (!response.ok) {
      throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${body.slice(0, 500)}`)
    }
    return body ? JSON.parse(body) : null
  }

  async function rows<Row>(path: string): Promise<Row[]> {
    const result = await fetchAllRows<Row, unknown>(async (from, to) => {
      try {
        return {
          data: await request(path, {
            headers: { Range: `${from}-${to}`, 'Range-Unit': 'items' },
          }) as Row[],
          error: null,
        }
      } catch (error) {
        return { data: null, error }
      }
    })
    if (result.error) throw result.error
    return result.data ?? []
  }

  async function pendingQueue(
    functionName: string,
    roomId: string,
    hostId: string,
    operatorCapability?: string,
  ): Promise<OperatorQueueRead> {
    try {
      const result = await fetchAllRows<unknown, unknown>(async (from, to) => {
        try {
          return {
            data: await request(`rpc/${functionName}`, {
              method: 'POST',
              body: JSON.stringify({
                p_room_id: roomId,
                p_actor_player_id: hostId,
                ...(operatorCapability
                  ? { p_operator_capability: operatorCapability }
                  : {}),
              }),
              headers: { Range: `${from}-${to}`, 'Range-Unit': 'items' },
            }) as unknown[],
            error: null,
          }
        } catch (error) {
          return { data: null, error }
        }
      })
      if (result.error) throw result.error
      return { count: result.data?.length ?? 0, error: null }
    } catch (error) {
      return { count: 0, error: error instanceof Error ? error.message : String(error) }
    }
  }

  function roomOperatorCapability(code: string): string | null {
    const environmentValue = process.env.ROOM_OPERATOR_CAPABILITY
    if (environmentValue !== undefined) {
      const capability = normalizeOperatorCapability(environmentValue)
      if (!capability) throw new Error('ROOM_OPERATOR_CAPABILITY is not valid 256-bit hexadecimal text')
      return capability
    }
    const path = resolve('.private', 'operator-capabilities', `${code}.token`)
    if (!existsSync(path)) return null
    const capability = normalizeOperatorCapability(readFileSync(path, 'utf8'))
    if (!capability) throw new Error(`operator capability file is invalid: ${path}`)
    return capability
  }

  async function read(requestedCode: string): Promise<OperatorRoomObservation> {
    const code = requestedCode.trim().toUpperCase()
    if (!code) throw new Error('operator room code is required')
    const roomRows = await rows<OperatorRoom>(
      `rooms?code=eq.${encodeURIComponent(code)}` +
        '&select=id,code,phase,host_id,active_settlement_id,show_pack_id',
    )
    if (roomRows.length !== 1) {
      throw new Error(`expected one room ${code}, found ${roomRows.length}`)
    }
    const room = roomRows[0]

    const [players, messages, winners, cards, heartbeats, showPacks] = await Promise.all([
      rows<OperatorRoomPlayer>(
        `players?room_id=eq.${room.id}&select=id,name,team,is_host&order=created_at.asc,id.asc`,
      ),
      rows<OperatorRoomMessage>(
        `messages?room_id=eq.${room.id}` +
          '&select=id,room_id,player_id,text,created_at&order=created_at.asc,id.asc',
      ),
      rows<{ category_id: number }>(
        `room_winners?room_id=eq.${room.id}&select=category_id&order=category_id.asc`,
      ),
      rows<OperatorRoomCard>(
        `bingo_cards?room_id=eq.${room.id}&select=id,player_id&order=created_at.asc,id.asc`,
      ),
      rows<OperatorRoomHeartbeat>(
        `operator_heartbeats?room_id=eq.${room.id}&engine=eq.companion_daemon` +
          '&select=room_id,engine,instance_id,started_at,heartbeat_at&order=heartbeat_at.desc',
      ),
      rows<{ pack_key: string; version: number; compiled_bundle: unknown }>(
        `show_packs?id=eq.${room.show_pack_id}&status=eq.published&select=pack_key,version,compiled_bundle`,
      ),
    ])
    if (heartbeats.length > 1) {
      throw new Error(`room ${code} has duplicate companion-daemon heartbeats`)
    }

    const marks = cards.length === 0
      ? []
      : await rows<OperatorRoomMark>(
          `bingo_marks?card_id=in.(${cards.map((card) => card.id).join(',')})` +
            '&select=id,card_id&order=marked_at.asc,id.asc',
        )
    const operatorCapability = roomOperatorCapability(code)
    const [groundingQueue, witnessQueue] = room.host_id === null
      ? [
          { count: 0, error: 'room has no host identity' },
          { count: 0, error: 'room has no host identity' },
        ]
      : await Promise.all([
          operatorCapability
            ? pendingQueue(
                'list_pending_companion_grounding_reviews_authorized',
                room.id,
                room.host_id,
                operatorCapability,
              )
            : Promise.resolve({
                count: 0,
                error: 'operator capability unavailable for grounding queue',
              }),
          operatorCapability
            ? pendingQueue(
                'list_pending_witness_proposals_authorized',
                room.id,
                room.host_id,
                operatorCapability,
              )
            : Promise.resolve({
                count: 0,
                error: 'operator capability unavailable for witness queue',
              }),
        ])

    let runtimeCastIds: string[] = []
    const bundle = showPacks[0]?.compiled_bundle
    if (bundle != null) {
      runtimeCastIds = buildRoomRuntimeNarrativeCast(room.show_pack_id, showPacks[0])
        ?.voices.map((voice) => voice.id) ?? []
    }

    return {
      observed_at_ms: Date.now(),
      room,
      players,
      messages,
      winner_count: winners.length,
      cards,
      marks,
      heartbeat: heartbeats[0] ?? null,
      grounding_queue: groundingQueue,
      witness_queue: witnessQueue,
      runtime_cast_ids: runtimeCastIds,
    }
  }

  return { target: config.target, read }
}
