import { beforeEach, describe, expect, it, vi } from 'vitest'

const channel = {
  on: vi.fn(),
  subscribe: vi.fn(),
  send: vi.fn(),
}
channel.on.mockReturnValue(channel)
channel.subscribe.mockReturnValue(channel)

const supabase = {
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(async () => 'ok'),
}

vi.mock('../lib/supabase', () => ({ supabase }))

describe('companion typing channel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    channel.on.mockReturnValue(channel)
    channel.subscribe.mockReturnValue(channel)
  })

  it('shares one room topic and survives a Strict Mode release/reacquire cycle', async () => {
    const { acquireCompanionTypingChannel } = await import('./companionTypingChannel')
    const firstListener = vi.fn()
    const secondListener = vi.fn()

    const first = acquireCompanionTypingChannel('room-1', firstListener)
    const second = acquireCompanionTypingChannel('room-1', secondListener)

    expect(supabase.channel).toHaveBeenCalledTimes(1)
    expect(channel.subscribe).toHaveBeenCalledTimes(1)

    first.release()
    second.release()
    const remounted = acquireCompanionTypingChannel('room-1')
    await vi.runAllTimersAsync()

    expect(supabase.removeChannel).not.toHaveBeenCalled()
    expect(supabase.channel).toHaveBeenCalledTimes(1)

    await remounted.send({ id: 'ned', typing: true })
    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'companion_typing',
      payload: { id: 'ned', typing: true },
    })

    remounted.release()
    await vi.runAllTimersAsync()
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1)
  })
})
