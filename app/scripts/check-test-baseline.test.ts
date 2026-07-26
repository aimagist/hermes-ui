import { describe, expect, it } from 'vitest'

import {
  collectFailedTests,
  compareFailures,
  validateReportCompleteness
} from './check-test-baseline'

function report(...tests: Array<[name: string, status: 'failed' | 'passed']>) {
  return {
    testResults: [
      {
        assertionResults: tests.map(([fullName, status]) => ({ fullName, status }))
      }
    ]
  }
}

describe('collectFailedTests', () => {
  it('returns only failed full test names in stable order', () => {
    expect(
      collectFailedTests(
        report(['suite passes', 'passed'], ['suite fails B', 'failed'], ['suite fails A', 'failed'])
      )
    ).toEqual(['suite fails A', 'suite fails B'])
  })
})

describe('compareFailures', () => {
  const baseline = ['known A', 'known B']

  it('accepts the exact known failure set', () => {
    expect(compareFailures(report(['known A', 'failed'], ['known B', 'failed']), baseline)).toEqual({
      knownRemaining: ['known A', 'known B'],
      resolved: [],
      unexpected: []
    })
  })

  it('accepts fewer failures and reports resolved debt', () => {
    expect(compareFailures(report(['known B', 'failed']), baseline)).toEqual({
      knownRemaining: ['known B'],
      resolved: ['known A'],
      unexpected: []
    })
  })

  it('rejects any failure absent from the baseline', () => {
    expect(compareFailures(report(['known A', 'failed'], ['new regression', 'failed']), baseline)).toEqual({
      knownRemaining: ['known A'],
      resolved: ['known B'],
      unexpected: ['new regression']
    })
  })
})

describe('validateReportCompleteness', () => {
  it('accepts a complete report at or above the baseline size', () => {
    expect(() => validateReportCompleteness({ numTotalTests: 1_202 }, 1_198)).not.toThrow()
  })

  it('rejects a partial report', () => {
    expect(() => validateReportCompleteness({ numTotalTests: 800 }, 1_198)).toThrow(
      'Vitest report is partial: 800 tests found, expected at least 1198'
    )
  })
})
