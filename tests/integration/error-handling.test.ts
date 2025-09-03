/**
 * Integration tests for centralized error handling system
 */

import { ErrorHandler, ErrorSeverity } from "../../src/utils/errors";
import { Logger } from "../../src/utils/logger";
import { ErrorType } from "../../src/types";

// Mock console methods
const mockConsoleError = jest.spyOn(console, "error").mockImplementation();
const mockConsoleLog = jest.spyOn(console, "log").mockImplementation();
const mockProcessExit = jest.spyOn(process, "exit").mockImplementation();

describe("Error Handling Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Logger.setVerbose(false);
    ErrorHandler.setVerbose(false);
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
    mockConsoleLog.mockRestore();
    mockProcessExit.mockRestore();
  });

  describe("Error categorization and display", () => {
    it("should handle authentication errors with appropriate severity", () => {
      const error = ErrorHandler.createError(
        ErrorType.AUTHENTICATION_ERROR,
        "Invalid token",
        "The provided token has expired",
        undefined,
        { tokenSource: "environment" }
      );

      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.type).toBe(ErrorType.AUTHENTICATION_ERROR);
      expect(error.suggestions).toContain("Check your Hugging Face token");

      ErrorHandler.displayError(error);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("🔐")
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Invalid token")
      );
    });

    it("should handle file errors with contextual suggestions", () => {
      const filePath = "/path/to/missing/file.txt";
      const suggestions = ErrorHandler.createContextualSuggestions(
        ErrorType.FILE_NOT_FOUND,
        { filePath }
      );

      expect(suggestions).toContain(`Check if file exists: ${filePath}`);
      expect(suggestions).toContain("Verify the file path is correct");
    });

    it("should handle network errors with repository context", () => {
      const repoId = "user/test-repo";
      const suggestions = ErrorHandler.createContextualSuggestions(
        ErrorType.NETWORK_ERROR,
        { repoId }
      );

      expect(suggestions).toContain(`Verify repository exists: ${repoId}`);
      expect(suggestions).toContain("Check your internet connection");
    });
  });

  describe("Verbose mode integration", () => {
    it("should show detailed error information in verbose mode", () => {
      ErrorHandler.setVerbose(true);
      Logger.setVerbose(true);

      const error = ErrorHandler.createError(
        ErrorType.RATE_LIMIT_ERROR,
        "Rate limit exceeded",
        "Too many requests in a short time",
        undefined,
        { requestCount: 100, timeWindow: "1 minute" },
        "RATE_001"
      );

      ErrorHandler.displayError(error);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Code: RATE_001")
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Severity: medium")
      );
    });

    it("should integrate with Logger verbose mode", () => {
      Logger.setVerbose(true);

      Logger.verbose("This is a verbose message");
      Logger.info("This is an info message");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("This is a verbose message")
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("This is an info message")
      );
    });
  });

  describe("Error handling workflow", () => {
    it("should handle complete error workflow from creation to display", () => {
      // Simulate a complete error handling workflow
      const context = {
        operation: "upload",
        fileName: "test.txt",
        repoId: "user/repo",
      };

      // Create error with context
      const error = ErrorHandler.createError(
        ErrorType.PERMISSION_ERROR,
        "Access denied",
        "You don't have write permissions to this repository",
        ErrorHandler.createContextualSuggestions(
          ErrorType.PERMISSION_ERROR,
          context
        ),
        context,
        "PERM_001"
      );

      // Display error (non-fatal)
      ErrorHandler.displayError(error);

      // Verify error was displayed correctly
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("🚫")
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Access denied")
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Suggestions:")
      );

      // Verify process didn't exit (displayError doesn't exit)
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it("should handle fatal errors with exit", () => {
      const error = ErrorHandler.createError(
        ErrorType.VALIDATION_ERROR,
        "Invalid command",
        "Required parameter missing"
      );

      ErrorHandler.handleError(error, 2);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(2);
    });
  });

  describe("Logger and ErrorHandler integration", () => {
    it("should coordinate verbose mode between Logger and ErrorHandler", () => {
      // Set verbose mode through Logger
      Logger.setVerbose(true);
      ErrorHandler.setVerbose(true);

      expect(Logger.isVerbose()).toBe(true);

      // Test that both systems respect verbose mode
      Logger.verbose("Verbose log message");

      const error = ErrorHandler.createError(
        ErrorType.NETWORK_ERROR,
        "Connection failed"
      );
      ErrorHandler.displayError(error);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Verbose log message")
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Severity: medium")
      );
    });
  });

  describe("Progress and status integration", () => {
    it("should coordinate progress indicators with error handling", () => {
      const progressId = "test-operation";

      // Start progress
      Logger.startProgress(progressId, "Testing operation...");

      // Simulate error during operation
      const error = ErrorHandler.createError(
        ErrorType.NETWORK_ERROR,
        "Operation failed",
        "Network timeout occurred"
      );

      // Fail progress and display error
      Logger.failProgress(progressId, "Operation failed");
      ErrorHandler.displayError(error);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("🌐")
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Operation failed")
      );
    });
  });
});
