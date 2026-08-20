<!-- For anything larger than a typo, please open an issue first so we can agree on the approach. -->

## What this changes

<!-- One or two sentences. Link the issue it closes: Closes #123 -->

## Why

<!-- The problem or bug this addresses. If it's a bug fix, what was the failure? -->

## Checklist

- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` passes
- [ ] If this touches capture, imports, or the release entry: `pnpm verify:release`, `verify:peers`, and `verify:absent` still pass
- [ ] New behavior has a test; a bug fix has a test that failed before the fix
- [ ] No new required dependency (optional backends are passed in as adapters, not `require()`d)
