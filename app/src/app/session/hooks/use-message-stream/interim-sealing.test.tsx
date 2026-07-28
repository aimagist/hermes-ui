import { QueryClient } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientSessionState } from '@/app/types'
import { chatMessageText } from '@/lib/chat-messages'
import { createClientSessionState } from '@/lib/chat-runtime'
import { $compactingSessions } from '@/store/compaction'
import type { RpcEvent } from '@/types/hermes'

import { useMessageStream } from './index'

const SID = 'session-1'
let handleEvent: ((event: RpcEvent) => void) | null = null
let states: Map<string, ClientSessionState>

function Harness() {
  const activeSessionIdRef = useRef<string | null>(SID)
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
      states.set(sessionId, next)

      return next
    }
  })

  useEffect(() => {
    handleEvent = stream.handleGatewayEvent
  }, [stream.handleGatewayEvent])

  return null
}

async function mountStream() {
  states = new Map()
  render(<Harness />)
  await waitFor(() => expect(handleEvent).not.toBeNull())
}

function emit(type: string, payload: Record<string, unknown> = {}) {
  act(() => handleEvent!({ payload, session_id: SID, type } as RpcEvent))
}

function assistantMessages(): string[] {
  return (states.get(SID)?.messages ?? [])
    .filter(message => message.role === 'assistant' && !message.hidden)
    .map(chatMessageText)
    .filter(Boolean)
}

describe('message.interim sealing', () => {
  beforeEach(() => {
    handleEvent = null
    $compactingSessions.set({})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('preserves interim text when the terminal response differs', async () => {
    await mountStream()
    emit('message.start')
    emit('message.delta', { text: 'Typecheck is clean.' })
    emit('message.interim', { text: 'Typecheck is clean.', already_streamed: true })
    emit('message.complete', { text: 'All checks passed.' })

    expect(assistantMessages()).toEqual(['Typecheck is clean.', 'All checks passed.'])
  })

  it('settles a previewed final response onto its interim bubble', async () => {
    await mountStream()
    emit('message.start')
    emit('message.delta', { text: 'partial answer' })
    emit('message.interim', { text: 'partial answer', already_streamed: true })
    emit('message.complete', { text: 'partial answer with detail', response_previewed: true })

    expect(assistantMessages()).toEqual(['partial answer with detail'])
  })

  it('deduplicates an identical final when it confirms the previewed response', async () => {
    await mountStream()
    emit('message.start')
    emit('message.interim', { text: 'identical answer', already_streamed: true })
    emit('message.complete', { text: 'identical answer', response_previewed: true })

    expect(assistantMessages()).toEqual(['identical answer'])
  })

  it('preserves an identical final as a separate response without the preview flag', async () => {
    await mountStream()
    emit('message.start')
    emit('message.interim', { text: 'identical answer', already_streamed: true })
    emit('message.complete', { text: 'identical answer' })

    expect(assistantMessages()).toEqual(['identical answer', 'identical answer'])
  })

  it('clears the compacting indicator when interim output proves the turn resumed', async () => {
    await mountStream()
    emit('status.update', { kind: 'compacting' })

    expect($compactingSessions.get()[SID]).toBe(true)

    emit('message.interim', { text: 'Back from compaction' })

    expect($compactingSessions.get()[SID]).toBeUndefined()
  })
})
