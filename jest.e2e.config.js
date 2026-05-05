/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src/__e2e__'],
  testMatch: ['**/*.e2e.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
  globalSetup: '<rootDir>/src/__e2e__/globalSetup.ts',
  globalTeardown: '<rootDir>/src/__e2e__/globalTeardown.ts',
  setupFiles: ['<rootDir>/src/__e2e__/jest.setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 30_000,
  maxWorkers: 1,
  clearMocks: true,
};
