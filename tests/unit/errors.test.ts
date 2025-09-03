/**
 * Unit tests for error handling system
 */

import {
  ErrorHandler,
  ErrorSeverity,
  createAuthError,
  createNetworkError,
  createFileError,
} from "../../src/utils/errors";
import { ErrorType } from "../../src/types";

// Mock console methods
const mockConsoleError = jest.spyOn(console, "error").mockImplementation();
const mockConsoleLog = jest.spyOn(console, "log").mockImplementation();
const mockProcessExit = jest.spyOn(process, "exit").mockImplementation();

describe("ErrorHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ErrorHandler.setVerbose(false);
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
    mockConsoleLog.mockRestore();
    mockProcessExit.mockRestore();
  });

  describe("createError", () => {
    it("should create a standardized CLI error", () => {
      const error = ErrorHandler.createError(
        ErrorType.AUTHENTICATION_ERROR,
        "Invalid token",
        "Token has expired",
        ["Get a new token"],
        { tokenSource: "env" },
        "AUTH001"
      );

      expect(error.type).toBe(ErrorType.AUTHENTICATION_ERROR);
      expect(error.message).toBe("Invalid token");
      expect(error.details).toBe("Token has expired");
      expect(error.suggestions).toEqual(["Get a new token"]);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.code).toBe("AUTH001");
      expect(error.context).toEqual({ tokenSource: "env" });
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it("should use default suggestions when none provided", () => {
      const error = ErrorHandler.createError(
        ErrorType.NETWORK_ERROR,
        "Connection failed"
      );

      expect(error.suggestions).toContain("Check your internet connection");
      expect(error.suggestions).toContain("Try again in a few moments");
    });

    it("should set appropriate severity based on error type", () => {
      const authError = ErrorHandler.createError(
        ErrorType.AUTHENTICATION_ERROR,
        "Auth failed"
      );
      const validationError = ErrorHandler.createError(
        ErrorType.VALIDATION_ERROR,
        "Invalid input"
      );

      expect(authError.severity).toBe(ErrorSeverity.HIGH);
      expect(validationError.severity).toBe(ErrorSeverity.LOW);
    });
  });

  describe("handleError", () => {
    it("should handle CLI errors and exit with specified code", () => {
      const error = ErrorHandler.createError(
        ErrorType.FILE_NOT_FOUND,
        "File not found",
        "The specified file does not exist"
      );

      ErrorHandler.handleError(error, 2);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(2);
    });

    it("should handle standard JavaScript errors", () => {
      const error = new Error("ENOENT: no such file or directory");

      ErrorHandler.handleError(error);

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it("should handle string errors", () => {
      ErrorHandler.handleError("Something went wrong");

      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it("should display verbose information when verbose mode is enabled", () => {
      ErrorHandler.setVerbose(true);

      const error = ErrorHandler.createError(
        ErrorType.NETWORK_ERROR,
        "Network error",
        "Connection timeout",
        undefined,
        { url: "https://example.com" }
      );

      ErrorHandler.handleError(error);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Verbose Error Information")
      );
    });
  });

  describe("displayError", () => {
    it("should display error with proper formatting", () => {
      const error = ErrorHandler.createError(
        ErrorType.VALIDATION_ERROR,
        "Invalid input",
        "Repository ID is required",
        ["Check the repository ID format"]
      );

      ErrorHandler.displayError(error);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Invalid input")
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Repository ID is required")
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Suggestions:")
      );
    });

    it("should show metadata in verbose mode", () => {
      ErrorHandler.setVerbose(true);

      const error = ErrorHandler.createError(
        ErrorType.RATE_LIMIT_ERROR,
        "Rate limited",
        undefined,
        undefined,
        undefined,
        "RATE001"
      );

      ErrorHandler.displayError(error);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Code: RATE001")
      );
    });
  });

  describe("createContextualSuggestions", () => {
    it("should create context-specific suggestions for auth errors", () => {
      const suggestions = ErrorHandler.createContextualSuggestions(
        ErrorType.AUTHENTICATION_ERROR,
        { tokenSource: "env", operation: "upload" }
      );

      expect(suggestions).toContain("Check your HF_TOKEN environment variable");
      expect(suggestions).toContain("Upload operations require authentication");
    });

    it("should create context-specific suggestions for file errors", () => {
      const suggestions = ErrorHandler.createContextualSuggestions(
        ErrorType.FILE_NOT_FOUND,
        { filePath: "/path/to/file.txt" }
      );

      expect(suggestions).toContain("Check if file exists: /path/to/file.txt");
    });

    it("should create context-specific suggestions for network errors", () => {
      const suggestions = ErrorHandler.createContextualSuggestions(
        ErrorType.NETWORK_ERROR,
        { repoId: "user/repo" }
      );

      expect(suggestions).toContain("Verify repository exists: user/repo");
    });
  });

  describe("error categorization", () => {
    it("should categorize ENOENT errors as FILE_NOT_FOUND", () => {
      const error = new Error("ENOENT: no such file or directory");
      ErrorHandler.handleError(error);

      // Check that the error was categorized correctly by examining console output
      const errorCalls = mockConsoleError.mock.calls;
      const errorMessage = errorCalls.find((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("📁"))
      );
      expect(errorMessage).toBeTruthy();
    });

    it("should categorize permission errors as PERMISSION_ERROR", () => {
      const error = new Error("EACCES: permission denied");
      ErrorHandler.handleError(error);

      const errorCalls = mockConsoleError.mock.calls;
      const errorMessage = errorCalls.find((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("🚫"))
      );
      expect(errorMessage).toBeTruthy();
    });

    it("should categorize 401 errors as AUTHENTICATION_ERROR", () => {
      const error = new Error("401 Unauthorized");
      ErrorHandler.handleError(error);

      const errorCalls = mockConsoleError.mock.calls;
      const errorMessage = errorCalls.find((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("🔐"))
      );
      expect(errorMessage).toBeTruthy();
    });

    it("should categorize rate limit errors as RATE_LIMIT_ERROR", () => {
      const error = new Error("429 Too Many Requests - Rate limit exceeded");
      ErrorHandler.handleError(error);

      const errorCalls = mockConsoleError.mock.calls;
      const errorMessage = errorCalls.find((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("⏱️"))
      );
      expect(errorMessage).toBeTruthy();
    });
  });
});

describe("Convenience error functions", () => {
  it("should create authentication errors", () => {
    const error = createAuthError("Token invalid", "Expired token", {
      source: "flag",
    });

    expect(error.type).toBe(ErrorType.AUTHENTICATION_ERROR);
    expect(error.message).toBe("Token invalid");
    expect(error.details).toBe("Expired token");
    expect(error.context).toEqual({ source: "flag" });
  });

  it("should create network errors", () => {
    const error = createNetworkError("Connection failed", "Timeout", {
      url: "https://api.com",
    });

    expect(error.type).toBe(ErrorType.NETWORK_ERROR);
    expect(error.message).toBe("Connection failed");
    expect(error.details).toBe("Timeout");
    expect(error.context).toEqual({ url: "https://api.com" });
  });

  it("should create file errors", () => {
    const error = createFileError("File not found", "Missing file", {
      path: "/test.txt",
    });

    expect(error.type).toBe(ErrorType.FILE_NOT_FOUND);
    expect(error.message).toBe("File not found");
    expect(error.details).toBe("Missing file");
    expect(error.context).toEqual({ path: "/test.txt" });
  });
});
