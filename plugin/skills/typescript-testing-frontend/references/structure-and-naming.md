# Directory Structure and Naming

## Directory Structure

Tests in co-located `__tests__/` folders next to source files:

```
apps/platform-app/
├── domains/
│   ├── quests/
│   │   ├── components/
│   │   │   ├── quest-tasks/
│   │   │   │   ├── TaskItem.tsx
│   │   │   │   └── __tests__/
│   │   │   │       ├── TaskItem.test.tsx
│   │   │   │       └── QuestTasks.test.tsx
│   │   ├── hooks/
│   │   │   ├── useQuestFilterGroup.ts
│   │   │   └── __tests__/
│   │   │       └── useQuestFilterGroup.test.tsx
│   ├── profile/
│   │   ├── components/
│   │   │   └── __tests__/
│   │   │       ├── ProfileStats.test.tsx
│   │   │       └── ProfileActivity.test.tsx
│   │   ├── hooks/
│   │   │   └── __tests__/
│   │   │       └── useProfileData.test.ts
│   │   └── __tests__/
│   │       └── ProfileMenu.test.tsx
├── test-utils/
│   └── render.tsx          ← Global test utilities with providers
└── config/jest/
    ├── jest.config.js
    ├── jest.setup.js
    └── env.setup.js
```

## Naming Conventions

| Type | Pattern | Example |
|---|---|---|
| Component tests | `{ComponentName}.test.tsx` | `TaskItem.test.tsx` |
| Hook tests | `use{HookName}.test.ts` or `.test.tsx` | `useProfileData.test.ts` |
| Integration tests | `{Feature}.integration.test.tsx` | `SignInModal.integration.test.tsx` |
