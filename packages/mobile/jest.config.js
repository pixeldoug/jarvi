/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts?(x)'],
  // i18n initialised in pt-BR for every test file.
  setupFiles: ['<rootDir>/jest.setup.ts'],
};
