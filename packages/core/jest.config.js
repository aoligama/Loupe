module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@loupe/contract$': '<rootDir>/../contract/src/index.ts',
  },
};
