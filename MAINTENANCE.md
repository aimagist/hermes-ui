# Maintaining the `aimagist/hermes-ui` fork

This fork preserves the browser adaptation from `przbadu/hermes-ui` while tracking compatible renderer and protocol changes from `NousResearch/hermes-agent`.

## Source roles

| Role | Repository | Policy |
|---|---|---|
| Fork | `aimagist/hermes-ui` | Stable, reviewed changes only |
| Vendor | `przbadu/hermes-ui` | Import browser-port maintenance |
| Source | `NousResearch/hermes-agent` | Audit Desktop/shared/Gateway changes |

## Sync policy

- Review after stable Hermes releases or a concrete compatibility issue.
- Port in small PRs; never auto-merge or auto-deploy.
- Keep browser adaptations centralized and exclude Electron-only surfaces and billing unless required.
- Update `UPSTREAM.md` with the audited and ported Hermes watermarks.

## Required validation

From `app/`:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run build
bun x vitest run --environment jsdom --reporter=json --outputFile=vitest-report.json
bun scripts/check-test-baseline.ts vitest-report.json test-baseline.json
```

The test suite has known failures on the inherited baseline. `test-baseline.json` names them explicitly. CI accepts resolved known failures but rejects any failure absent from that file. Do not add a failure to the baseline without documenting why it is inherited or intentionally deferred.

## Baseline

| Fork commit | Hermes validated | Typecheck | Lint | Build | Tests |
|---|---|---|---|---|---|
| `631d0f195` | `0.19.0` | pass | pass | pass with warnings | 1,167 pass / 31 known fail |

## Deployment

CI creates artifacts but never deploys. Candidate bundles are smoke-tested outside production, copied to an immutable SHA directory, and deployed only after explicit approval with the previous `HERMES_WEB_DIST` retained for rollback.
