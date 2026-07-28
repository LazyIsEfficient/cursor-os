# Coverage and Testing Policy

## Coverage Configuration

Coverage **enabled by default** (`collectCoverage: true`). CI outputs JUnit XML to `test-results/jest/results.xml`. No explicit thresholds configured.

Excluded from coverage: `coveragePathIgnorePatterns: ['<rootDir>/test/test-utils.js']`

## Testing Policy

### No Snapshot Testing

Behavioral assertions exclusively. Do not introduce snapshot tests.

### Keep All Tests Active

- Fix broken tests — never `test.skip()` or comment out
- Delete tests genuinely no longer relevant

### Every Test Must Assert

Every `it()` block must include at least one `expect()` validating observable behavior.

### Test Failure Response

- **Fix the test**: Wrong expected values, implementation detail coupling, flaky assertions
- **Fix the implementation**: Valid business rules, edge cases, contract violations
- **When in doubt**: Confirm with user before changing either
