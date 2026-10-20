const nextJest = require('next/jest')
module.exports = nextJest({ dir: './' })({
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../Atspm/WebUI/src/$1',
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '^react-dom/(.*)$': '<rootDir>/node_modules/react-dom/$1',
  },
})
