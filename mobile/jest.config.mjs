/**
 * Jest config for the mobile package (pure-TS unit tests only).
 *
 * Scope: dependency-free modules in src/lib (task-parser, event-parser, ...).
 * Tests live in tests/*.test.ts and run in a plain Node environment — no
 * jest-expo / react-native preset needed. Run with `npm test`.
 *
 * ts-jest compiles with tsconfig.jest.json (standalone CommonJS config) so we
 * don't inherit Expo's bundler moduleResolution, which Node can't execute.
 */

/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }],
  },
}
