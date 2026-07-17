/**
 * Jest config for the backend (ESM + TypeScript via ts-jest).
 *
 * Tests live in tests/*.test.ts (outside src/ so `tsc` build output and the
 * rootDir stay clean). Run with `npm test` — the script passes
 * --experimental-vm-modules, required for Jest's native ESM support.
 */

/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  // Source files use NodeNext-style ".js" import specifiers; map them back
  // to the TS sources for ts-jest.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          module: "ESNext",
          moduleResolution: "Bundler",
          verbatimModuleSyntax: false,
          rootDir: ".",
        },
      },
    ],
  },
}
