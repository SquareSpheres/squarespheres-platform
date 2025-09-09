# Frontend Testing

This project uses Jest and React Testing Library for testing the frontend components and utilities.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode for development
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

Tests are organized in the `__tests__` directory with the following structure:

```
__tests__/
├── components/          # Component tests
│   └── ThemeSwitcher.test.tsx
└── utils/              # Utility function tests
    └── formatFileSize.test.ts
```

## Writing Tests

### Component Tests

Component tests use React Testing Library to render components and test their behavior:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeSwitcher } from '../../app/components/ThemeSwitcher'

test('renders the theme switcher button', () => {
  render(<ThemeSwitcher />)
  const button = screen.getByRole('button')
  expect(button).toBeInTheDocument()
})
```

### Utility Tests

Utility function tests are straightforward unit tests:

```typescript
import { formatFileSize } from '../../app/utils/formatFileSize'

test('formats bytes correctly', () => {
  expect(formatFileSize(1024)).toBe('1 KB')
})
```

## Test Configuration

- **Jest Configuration**: `jest.config.js`
- **Test Setup**: `jest.setup.js` (includes testing library matchers and mocks)
- **Environment**: jsdom (browser-like environment)

## CI Integration

Tests are automatically run in GitHub Actions on every push and pull request. The test step is included in the existing CI workflow at `.github/workflows/ci.yml`.

## Coverage

Coverage reports can be generated using `npm run test:coverage`. The project aims for:
- 50% branch coverage
- 50% function coverage  
- 50% line coverage
- 50% statement coverage
