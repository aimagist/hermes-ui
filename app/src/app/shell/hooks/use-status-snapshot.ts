import { useEffect, useState } from 'react'

import { getStatus } from '@/hermes'
import { evaluateRuntimeReadiness, type RuntimeReadinessResult } from '@/lib/runtime-readiness'
import type { StatusResponse } from '@/types/hermes'

const REFRESH_MS = 15_000

type GatewayRequester = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>

export function useStatusSnapshot(gatewayState: string | undefined, requestGateway: GatewayRequester) {
  const [statusSnapshot, setStatusSnapshot] = useState<StatusResponse | null>(null)
  const [inferenceStatus, setInferenceStatus] = useState<RuntimeReadinessResult | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    if (gatewayState !== 'open') {
      setInferenceStatus(null)
    }

    const scheduleRefresh = () => {
      if (!cancelled) {
        timer = window.setTimeout(() => void refresh(), REFRESH_MS)
      }
    }

    const refresh = async () => {
      try {
        const [statusResult, inferenceResult] = await Promise.allSettled([
          getStatus(),
          gatewayState === 'open'
            ? evaluateRuntimeReadiness(requestGateway)
            : Promise.resolve(null)
        ])

        if (cancelled) {
          return
        }

        if (statusResult.status === 'fulfilled') {
          setStatusSnapshot(statusResult.value)
        }

        if (inferenceResult.status === 'fulfilled') {
          const inference = inferenceResult.value

          if (inference === null) {
            setInferenceStatus(null)
          } else if (inference.source !== 'fallback') {
            setInferenceStatus(inference)
          }
        }
      } finally {
        scheduleRefresh()
      }
    }

    void refresh()

    return () => {
      cancelled = true

      if (timer !== undefined) {
        window.clearTimeout(timer)
      }
    }
  }, [gatewayState, requestGateway])

  return { inferenceStatus, statusSnapshot }
}
