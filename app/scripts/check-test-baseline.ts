import { readFileSync } from 'node:fs'

interface AssertionResult {
  fullName?: unknown
  status?: unknown
}

interface TestFileResult {
  assertionResults?: unknown
}

interface VitestReport {
  numTotalTests?: unknown
  testResults?: unknown
}

interface BaselineFile {
  allowed_failed_tests?: unknown
  tests_total_at_baseline?: unknown
}

export interface FailureComparison {
  knownRemaining: string[]
  resolved: string[]
  unexpected: string[]
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

export function collectFailedTests(report: unknown): string[] {
  if (!report || typeof report !== 'object') {
    throw new Error('Vitest report must be an object')
  }

  const testResults = (report as VitestReport).testResults

  if (!Array.isArray(testResults)) {
    throw new Error('Vitest report is missing testResults[]')
  }

  const failures: string[] = []

  for (const result of testResults as TestFileResult[]) {
    if (!Array.isArray(result.assertionResults)) {
      continue
    }

    for (const assertion of result.assertionResults as AssertionResult[]) {
      if (assertion.status === 'failed' && typeof assertion.fullName === 'string') {
        failures.push(assertion.fullName)
      }
    }
  }

  return sortedUnique(failures)
}

export function validateReportCompleteness(report: unknown, minimumTests: number): void {
  if (!report || typeof report !== 'object') {
    throw new Error('Vitest report must be an object')
  }

  if (!Number.isInteger(minimumTests) || minimumTests < 0) {
    throw new Error('Baseline tests_total_at_baseline must be a non-negative integer')
  }

  const totalTests = (report as VitestReport).numTotalTests

  if (!Number.isInteger(totalTests)) {
    throw new Error('Vitest report is missing numTotalTests')
  }

  if ((totalTests as number) < minimumTests) {
    throw new Error(
      `Vitest report is partial: ${String(totalTests)} tests found, expected at least ${minimumTests}`
    )
  }
}

export function compareFailures(report: unknown, allowedFailures: readonly string[]): FailureComparison {
  const actual = collectFailedTests(report)
  const actualSet = new Set(actual)
  const allowed = sortedUnique(allowedFailures)
  const allowedSet = new Set(allowed)

  return {
    knownRemaining: actual.filter(name => allowedSet.has(name)),
    resolved: allowed.filter(name => !actualSet.has(name)),
    unexpected: actual.filter(name => !allowedSet.has(name))
  }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

function main(): number {
  const [reportPath, baselinePath] = process.argv.slice(2)

  if (!reportPath || !baselinePath) {
    console.error('Usage: bun scripts/check-test-baseline.ts <vitest-report.json> <test-baseline.json>')

    return 2
  }

  try {
    const report = readJson(reportPath)
    const baseline = readJson(baselinePath)
    const allowedFailures = (baseline as BaselineFile).allowed_failed_tests
    const minimumTests = (baseline as BaselineFile).tests_total_at_baseline

    if (!Array.isArray(allowedFailures) || !allowedFailures.every(name => typeof name === 'string')) {
      throw new Error('Baseline is missing allowed_failed_tests[]')
    }

    if (!Number.isInteger(minimumTests) || (minimumTests as number) < 0) {
      throw new Error('Baseline is missing tests_total_at_baseline')
    }

    validateReportCompleteness(report, minimumTests as number)

    const comparison = compareFailures(report, allowedFailures)
    console.log(`Known failures remaining: ${comparison.knownRemaining.length}`)
    console.log(`Known failures resolved: ${comparison.resolved.length}`)

    if (comparison.resolved.length > 0) {
      console.log('Resolved debt:')

      for (const name of comparison.resolved) {
        console.log(`  - ${name}`)
      }
    }

    if (comparison.unexpected.length > 0) {
      console.error(`Unexpected failures: ${comparison.unexpected.length}`)

      for (const name of comparison.unexpected) {
        console.error(`  - ${name}`)
      }

      return 1
    }

    console.log('TEST_BASELINE_OK')

    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))

    return 2
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/scripts/check-test-baseline.ts')) {
  process.exitCode = main()
}
