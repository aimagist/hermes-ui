import { QueryClient } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { type MutableRefObject, useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientSessionState } from '@/app/types'
import { chatMessageText } from '@/lib/chat-messages'
import { createClientSessionState } from '@/lib/chat-runtime'
import type { RpcEvent } from '@/types/hermes'

import { useMessageStream } from './index'

let activeSessionIdRef: MutableRefObject<string | null> | null = null
let handleEvent: ((event: RpcEvent) => void) | null = null
let states: Map<string, ClientSessionState>

function Harness() {
  const activeRef = useRef<string | null>('session-a')
  const sessionStateByRuntimeIdRef = useRef(states)
  const queryClientRef = useRef(new QueryClient())

  const stream = useMessageStream({
    activeSessionIdRef: activeRef,
    hydrateFromStoredSession: vi.fn(async () => undefined),
    queryClient: queryClientRef.current,
    refreshHermesConfig: vi.fn(async () => undefined),
    refreshSessions: vi.fn(async () => undefined),
    sessionStateByRuntimeIdRef,
    updateSessionState: (sessionId, updater) => {
      const current = states.get(sessionId) ?? createClientSessionState()
      const next = updater(current)
      states.set(sessionId, next)

      return next
    }
  })

  useEffect(() => {
    activeSessionIdRef = activeRef
    handleEvent = stream.handleGatewayEvent
  }, [activeRef, stream.handleGatewayEvent])

  return null
}

describe('useMessageStream unscoped gateway event routing', () => {
  beforeEach(() => {
    activeSessionIdRef = null
    handleEvent = null
    states = new Map()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('keeps an unscoped stream on the session where it started after focus changes', async () => {
    render(<Harness />)
    await waitFor(() => expect(handleEvent).not.toBeNull())

    act(() => handleEvent!({ payload: {}, type: 'message.start' }))
    activeSessionIdRef!.current = 'session-b'
    act(() => handleEvent!({ payload: { text: 'belongs to A' }, type: 'message.delta' }))
    act(() => handleEvent!({ payload: { text: 'belongs to A' }, type: 'message.complete' }))

    const sessionA = states.get('session-a')

    expect(sessionA?.messages.map(chatMessageText)).toContain('belongs to A')
    expect(states.get('session-b')?.messages ?? []).toHaveLength(0)
  })
})
