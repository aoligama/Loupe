module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@loupe/contract$': '<rootDir>/../contract/src/index.ts',
    '^@loupe/core$': '<rootDir>/../core/src/index.ts',
  },
  transformIgnorePatterns: ['node_modules/(?!(@react-native|react-native)/)'],
};
