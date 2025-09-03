// Jest setup file for global test configuration
// This file runs before each test suite

// Set up any global test utilities or mocks here
global.console = {
  ...console,
  // Suppress console.log during tests unless explicitly needed
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
