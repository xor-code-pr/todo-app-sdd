import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Constitution Principle III: "eslint-plugin-jsx-a11y MUST run at `error` severity;
// warnings are not acceptable." The recommended preset ships some rules at 'warn',
// so every rule it ENABLES is promoted to 'error' here rather than trusting the preset.
//
// Rules the preset sets to 'off' are not blanket-promoted — a few are disabled
// upstream on purpose. Each exception below is decided individually rather than
// by a rule that happens to produce a quiet build.
const a11yRulesAtError = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules)
    .filter(([, level]) => level !== 'off' && level !== 0)
    .map(([rule]) => [rule, 'error']),
)

const a11yOverrides = {
  // OFF in the preset, but it catches a real barrier ("click here", "learn
  // more") and produces no false positives in this codebase. Turned on.
  'jsx-a11y/anchor-ambiguous-text': 'error',

  // Deprecated upstream in favour of label-has-associated-control, which is
  // already enabled above. Leaving a deprecated rule on buys nothing.
  'jsx-a11y/label-has-for': 'off',

  // Static-only: it cannot see that htmlFor and id match when both come from
  // useId(), so it reports correct markup. The association is still verified —
  // by axe-core at runtime in the E2E suite, where the ids are real. Disabled
  // here rather than scattered as inline suppressions.
  'jsx-a11y/control-has-associated-label': 'off',
}

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'playwright-report',
      'test-results',
      // Generated from the emitted OpenAPI schema — never hand-edited, never linted.
      'src/api/schema.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    plugins: {
      'jsx-a11y': jsxA11y,
      'react-hooks': reactHooks,
    },
    rules: {
      ...a11yRulesAtError,
      ...a11yOverrides,

      // Principle IV: `any` is prohibited; `unknown` with narrowing is the escape hatch.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // The FR-021 focus effect lives or dies by its dependency array.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // Test files run under Node + Vitest globals are imported explicitly, but
  // jsdom tests still touch browser globals.
  {
    files: ['**/*.test.{ts,tsx}', 'src/setupTests.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // Vite and Playwright config run in Node.
  {
    files: ['*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
  },
)
