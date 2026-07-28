import { QueryClient } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientSessionState } from '@/app/types'
import { createClientSessionState } from '@/lib/chat-runtime'
import {
  $currentModel,
  $currentProvider,
  setCurrentModel,
  setCurrentProvider
} from '@/store/session'
import type { RpcEvent } from '@/types/hermes'

import { useMessageStream } from './index'

let handleEvent: ((event: RpcEvent) => void) | null = null

function Harness() {
  const activeSessionIdRef = useRef<string | null>(null)
  const sessionStateByRuntimeIdRef = useRef(new Map<string, ClientSessionState>())
  const queryClientRef = useRef(new QueryClient())

  const stream = useMessageStream({
    activeSessionIdRef,
    hydrateFromStoredSession: vi.fn(async () => undefined),
    queryClient: queryClientRef.current,
    refreshHermesConfig: vi.fn(async () => undefined),
    refreshSessions: vi.fn(async () => undefined),
    sessionStateByRuntimeIdRef,
    updateSessionState: (sessionId, updater) => {
      const current = sessionStateByRuntimeIdRef.current.get(sessionId) ?? createClientSessionState()
      const next = updater(current)

      sessionStateByRuntimeIdRef.current.set(sessionId, next)

      return next
    }
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
    setCurrentProvider('deepseek')
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
        type: 'session.info'
      })
    )

    expect($currentModel.get()).toBe('deepseek-v4-flash')
    expect($currentProvider.get()).toBe('deepseek')
  })
})
