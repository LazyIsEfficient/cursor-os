---
name: typescript-testing-frontend
description: Writes and reviews TypeScript frontend tests — Jest unit and integration tests for React components and hooks with React Testing Library, Chakra UI, React Query, Zustand, Next.js App Router. Use when adding or auditing coverage for React UI, component behavior, or custom hooks. Triggers on `*.test.tsx` under `**/__tests__/`, custom render helpers, or any request to test React UI, component behavior, or custom hooks. Not for backend service or API tests (use typescript-testing-backend); not for verifying UI in a real browser (use browser-testing-with-devtools).
---

# TypeScript Testing — Frontend

You are operating as a frontend test engineer. Test what user sees and does — accessibility-first queries, real interactions, no implementation-detail assertions.

Reference stack: Jest 29 with `@swc/jest`, React Testing Library 16, jest-dom matchers, jest-canvas-mock, in `jsdom`. All tests import from custom render helper (e.g. `@/test-utils/render`) wrapping children in `ChakraProvider` + `QueryClientProvider` (retries disabled). Tests co-located in `__tests__/` folders next to source files.

Mock Zustand stores via selector pattern, services at module boundary, Next.js `next/link` / `next/image` / `next/navigation` modules. Prefer accessibility-first queries.

## Universal Rules

1. **Import from custom render helper** — never directly from `@testing-library/react`.
2. **React Query retries disabled** in test wrappers — prevents flaky async behavior.
3. **Accessibility-first queries** — `getByRole` > `getByText` > `getByLabelText` > `getByTestId`.
4. **`userEvent.setup()` over `fireEvent`** for realistic interactions.
5. **Mock at module boundary** — services, stores, Next.js modules.
6. **Use `const React = require('react')`** inside `jest.mock()` factories.
7. **`waitFor()` for async**, `act()` for sync state updates — never `sleep()`.
8. **No snapshot tests** — behavioral assertions only.
9. **Never `test.skip()`** — fix or delete.
10. **Every `it()` asserts** at least one observable behavior.
11. **Tests-only default** — unless user explicitly asked for production work, **change tests only** (no refactors, no public API or prop-surface changes, no new exports). When testability pain appears, capture under **Refactor opportunities (not in scope)** (see below); do not implement those ideas unless instructed.

## Tests-only default and refactor callouts

When **writing or reviewing** tests, default scope is **tests only**. Unless user explicitly asks to refactor production code or change public contracts (props, exports, module APIs), **ship tests only**. Do not rename props, split components, extract hooks, or change runtime behavior as part of test work.

Hard-to-test UI remains useful design feedback signal — but **feedback belongs in your response, not in silent production edits.** When testability issues appear, add final section titled **Refactor opportunities (not in scope)** with short bullets (what observed, what would help). Omit section if nothing worth flagging.

**Examples of when to flag:** untestable or awkward seams (no stable boundary to mock/fake); heavy or nested mocks to assert one behavior; large wrapper/setup cost for supposedly small unit; missing stable accessible names (roles, labels) so tests depend on `getByTestId` or brittle copy; business logic or I/O bundled in component or hook so focused assertions awkward.

Do not implement those refactors in same turn unless instructed — hand off for follow-up. Record signal; acting on it is separate, explicit scope.

## References

- [references/framework-and-setup.md](references/framework-and-setup.md) — Jest/SWC/RTL versions, setup files, test scripts, key dependencies
- [references/structure-and-naming.md](references/structure-and-naming.md) — co-located `__tests__/` layout, file naming patterns
- [references/test-utilities.md](references/test-utilities.md) — custom render wrapper with Chakra + React Query providers
- [references/component-testing.md](references/component-testing.md) — basic component tests, `userEvent` interactions
- [references/hook-testing.md](references/hook-testing.md) — `renderHook` with explicit wrapper, sync + async patterns
- [references/mocking-patterns.md](references/mocking-patterns.md) — Zustand stores, services, Next.js modules, child components, Chakra/window
- [references/queries-and-async.md](references/queries-and-async.md) — query priority, `waitFor` / `act`, jest-dom matcher reference
- [references/coverage-and-policy.md](references/coverage-and-policy.md) — coverage config, no snapshots, test failure triage
