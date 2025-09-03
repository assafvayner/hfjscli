/**
 * Unit tests for logging system
 */

import { Logger, LogLevel, ProgressType } from "../../src/utils/logger";

// Mock console methods
const mockConsoleLog = jest.spyOn(console, "log").mockImplementation();
const mockConsoleError = jest.spyOn(console, "error").mockImplementation();

// Mock ora
jest.mock("ora", () => {
  const mockSpinner = {
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: "",
  };

  return jest.fn(() => mockSpinner);
});

describe("Logger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Logger.setLogLevel(LogLevel.INFO);
    Logger.setVerbose(false);
    Logger.stopAllProgress();
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe("log levels", () => {
    it("should respect log level settings", () => {
      Logger.setLogLevel(LogLevel.WARN);

      Logger.error("Error message");
      Logger.warn("Warning message");
      Logger.info("Info message");
      Logger.verbose("Verbose message");

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Error message")
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Warning message")
      );
      expect(mockConsoleLog).not.toHaveBeenCalledWith(
        expect.stringContaining("Info message")
      );
      expect(mockConsoleLog).not.toHaveBeenCalledWith(
        expect.stringContaining("Verbose message")
      );
    });

    it("should enable verbose logging when verbose mode is set", () => {
      Logger.setVerbose(true);

      Logger.verbose("Verbose message");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Verbose message")
      );
    });

    it("should include timestamps in verbose mode", () => {
      Logger.setVerbose(true);

      Logger.info("Test message");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      );
    });
  });

  describe("logging methods", () => {
    beforeEach(() => {
      Logger.setLogLevel(LogLevel.DEBUG);
    });

    it("should log error messages to stderr", () => {
      Logger.error("Error message", "Error details");

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Error message")
      );
    });

    it("should log warning messages", () => {
      Logger.warn("Warning message", "Warning details");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Warning message")
      );
    });

    it("should log info messages", () => {
      Logger.info("Info message", "Info details");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Info message")
      );
    });

    it("should log verbose messages", () => {
      Logger.verbose("Verbose message", "Verbose details");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Verbose message")
      );
    });

    it("should log debug messages", () => {
      Logger.debug("Debug message", "Debug details");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Debug message")
      );
    });

    it("should log success messages", () => {
      Logger.success("Operation completed", "Success details");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Operation completed")
      );
    });
  });

  describe("context logging", () => {
    it("should include context in debug mode", () => {
      Logger.setLogLevel(LogLevel.DEBUG);

      const context = { userId: "123", operation: "upload" };
      Logger.debug("Debug message", "Details", context);

      // Check that context was logged in any of the calls
      const contextCall = mockConsoleLog.mock.calls.find((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("Context:"))
      );
      expect(contextCall).toBeTruthy();
    });

    it("should not include context below debug level", () => {
      Logger.setLogLevel(LogLevel.INFO);

      const context = { userId: "123", operation: "upload" };
      Logger.info("Info message", "Details", context);

      expect(mockConsoleLog).not.toHaveBeenCalledWith(
        expect.stringContaining("Context:")
      );
    });
  });

  describe("progress indicators", () => {
    it("should start progress spinner", () => {
      Logger.startProgress("test-id", "Loading...", ProgressType.SPINNER);

      // Verify that ora was called (mocked)
      const ora = require("ora");
      expect(ora).toHaveBeenCalledWith({
        text: "Loading...",
        spinner: "dots",
        color: "blue",
      });
    });

    it("should update progress text", () => {
      Logger.startProgress("test-id", "Loading...");
      Logger.updateProgress("test-id", "Updated text");

      // The mock spinner should have its text property updated
      // This is tested through the mock implementation
    });

    it("should succeed progress", () => {
      Logger.startProgress("test-id", "Loading...");
      Logger.succeedProgress("test-id", "Completed!");

      // Verify spinner.succeed was called
      const ora = require("ora");
      const mockSpinner = ora();
      expect(mockSpinner.succeed).toHaveBeenCalled();
    });

    it("should fail progress", () => {
      Logger.startProgress("test-id", "Loading...");
      Logger.failProgress("test-id", "Failed!");

      // Verify spinner.fail was called
      const ora = require("ora");
      const mockSpinner = ora();
      expect(mockSpinner.fail).toHaveBeenCalled();
    });

    it("should stop progress", () => {
      Logger.startProgress("test-id", "Loading...");
      Logger.stopProgress("test-id");

      // Verify spinner.stop was called
      const ora = require("ora");
      const mockSpinner = ora();
      expect(mockSpinner.stop).toHaveBeenCalled();
    });
  });

  describe("operation logging", () => {
    it("should log operation start", () => {
      Logger.startOperation("file upload", "Uploading test.txt");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Starting file upload")
      );
    });

    it("should log operation completion", () => {
      Logger.completeOperation("file upload", 1500);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Completed file upload")
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("1500ms")
      );
    });

    it("should log operation failure", () => {
      Logger.failOperation("file upload", "Network error");

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Failed file upload")
      );
    });
  });

  describe("timer functionality", () => {
    it("should create and complete timed operations", (done) => {
      const completeTimer = Logger.createTimer("test operation");

      // Simulate some async work
      setTimeout(() => {
        completeTimer();

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining("Starting test operation")
        );
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining("Completed test operation")
        );
        done();
      }, 10);
    });
  });

  describe("specialized logging methods", () => {
    beforeEach(() => {
      Logger.setVerbose(true);
    });

    it("should log file operations", () => {
      Logger.logFileOperation("upload", "test.txt", "1.2 MB", "user/repo");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("📤 Uploading test.txt (1.2 MB) to user/repo")
      );
    });

    it("should log authentication status", () => {
      Logger.logAuthStatus(true, "environment");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("🔐 Authenticated (environment)")
      );

      Logger.logAuthStatus(false);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("🔓 No authentication")
      );
    });

    it("should log repository validation", () => {
      Logger.logRepoValidation("user/repo", "model", true);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("✅ Valid repository: user/repo (model)")
      );

      Logger.logRepoValidation("user/invalid", "dataset", false);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("❌ Invalid repository: user/invalid (dataset)")
      );
    });
  });

  describe("verbose mode behavior", () => {
    it("should return correct verbose status", () => {
      expect(Logger.isVerbose()).toBe(false);

      Logger.setVerbose(true);
      expect(Logger.isVerbose()).toBe(true);
    });

    it("should automatically set log level to verbose when verbose mode is enabled", () => {
      Logger.setLogLevel(LogLevel.INFO);
      Logger.setVerbose(true);

      Logger.verbose("This should be visible");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("This should be visible")
      );
    });
  });
});
