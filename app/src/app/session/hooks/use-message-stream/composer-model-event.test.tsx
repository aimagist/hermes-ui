import { QueryClient } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  $currentModel,
  $currentProvider,
  setCurrentModel,
  setCurrentProvider
} from '@/store/session'
import type { RpcEvent } from '@/types/hermes'

import { useSessionStateCache } from '../use-session-state-cache'

import { useMessageStream } from './index'

const SID = 'session-1'
let handleEvent: ((event: RpcEvent) => void) | null = null

function Harness() {
  const busyRef = useRef(false)
  const queryClientRef = useRef(new QueryClient())

  const cache = useSessionStateCache({
    activeSessionId: SID,
    busyRef,
    selectedStoredSessionId: null,
    setAwaitingResponse: vi.fn(),
    setBusy: vi.fn(),
    setMessages: vi.fn()
  })

  const stream = useMessageStream({
    activeSessionIdRef: cache.activeSessionIdRef,
    hydrateFromStoredSession: vi.fn(async () => undefined),
    queryClient: queryClientRef.current,
    refreshHermesConfig: vi.fn(async () => undefined),
    refreshSessions: vi.fn(async () => undefined),
    sessionStateByRuntimeIdRef: cache.sessionStateByRuntimeIdRef,
    updateSessionState: cache.updateSessionState
  })

  useEffect(() => {
    handleEvent = stream.handleGatewayEvent
  }, [stream.handleGatewayEvent])

  return null
}

describe('session.info composer model routing', () => {
  beforeEach(() => {
    handleEvent = null
    setCurrentModel('deepseek-v4-flash')
    setCurrentProvider('openrouter')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    setCurrentModel('')
    setCurrentProvider('')
  })

  it('does not overwrite a sticky manual composer pick with a profile default', async () => {
    render(<Harness />)
    await waitFor(() => expect(handleEvent).not.toBeNull())

    act(() =>
      handleEvent!({
        payload: { model: 'deepseek-chat', provider: 'deepseek' },
        session_id: SID,
        type: 'session.info'
      })
    )

    expect($currentModel.get()).toBe('deepseek-v4-flash')
    expect($currentProvider.get()).toBe('openrouter')
  })
})
