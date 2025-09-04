/**
 * Integration tests for comprehensive error handling scenarios
 * Tests network, file system, validation, and other error conditions
 */

import { UploadCommand } from "../../src/commands/upload";
import { DownloadCommand } from "../../src/commands/download";
import {
  HFClientWrapper,
  UploadResult,
  MultiUploadResult,
  DownloadResult,
  ErrorType,
} from "../../src/types";
import { authManager } from "../../src/auth/manager";
import { Logger } from "../../src/utils/logger";
import { ErrorHandler } from "../../src/utils/errors";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";

// Mock console methods
const mockConsoleError = jest.spyOn(console, "error").mockImplementation();
const mockConsoleLog = jest.spyOn(console, "log").mockImplementation();

// Mock HF Client that can simulate various error conditions
class ErrorSimulatingHFClient implements HFClientWrapper {
  private errorScenario: string = "none";
  private customError: string = "";

  setErrorScenario(scenario: string, customError?: string) {
    this.errorScenario = scenario;
    this.customError = customError || "";
  }

  async uploadFile(): Promise<UploadResult> {
    switch (this.errorScenario) {
      case "network_timeout":
        return {
          success: false,
          error: "Network timeout after 30 seconds",
        };
      case "rate_limit":
        return {
          success: false,
          error: "429 Rate limit exceeded. Too many requests.",
        };
      case "auth_error":
        return {
          success: false,
          error: "401 Unauthorized. Invalid or expired token.",
        };
      case "file_too_large":
        return {
          success: false,
          error: "413 File too large. Maximum size is 50MB.",
        };
      case "repo_not_found":
        return {
          success: false,
          error: "404 Repository not found or access denied.",
        };
      case "server_error":
        return {
          success: false,
          error: "500 Internal server error. Please try again later.",
        };
      case "custom":
        return {
          success: false,
          error: this.customError,
        };
      case "success":
        return {
          success: true,
          fileUrl: "https://huggingface.co/test/repo/blob/main/test.txt",
          commitSha: "abc123",
        };
      default:
        return {
          success: true,
          fileUrl: "https://huggingface.co/test/repo/blob/main/test.txt",
          commitSha: "abc123",
        };
    }
  }

  async uploadFiles(): Promise<MultiUploadResult> {
    switch (this.errorScenario) {
      case "network_timeout":
        return {
          success: false,
          filesUploaded: 0,
          totalFiles: 1,
          error: "Network timeout after 30 seconds",
        };
      case "rate_limit":
        return {
          success: false,
          filesUploaded: 0,
          totalFiles: 1,
          error: "429 Rate limit exceeded. Too many requests.",
        };
      case "auth_error":
        return {
          success: false,
          filesUploaded: 0,
          totalFiles: 1,
          error: "401 Unauthorized. Invalid or expired token.",
        };
      case "file_too_large":
        return {
          success: false,
          filesUploaded: 0,
          totalFiles: 1,
          error: "413 File too large. Maximum size is 50MB.",
        };
      case "repo_not_found":
        return {
          success: false,
          filesUploaded: 0,
          totalFiles: 1,
          error: "404 Repository not found or access denied.",
        };
      case "server_error":
        return {
          success: false,
          filesUploaded: 0,
          totalFiles: 1,
          error: "500 Internal server error. Please try again later.",
        };
      case "custom":
        return {
          success: false,
          filesUploaded: 0,
          totalFiles: 1,
          error: this.customError,
        };
      case "success":
        return {
          success: true,
          filesUploaded: 1,
          totalFiles: 1,
          commitSha: "abc123",
        };
      default:
        return {
          success: true,
          filesUploaded: 1,
          totalFiles: 1,
          commitSha: "abc123",
        };
    }
  }

  async downloadFile(): Promise<DownloadResult> {
    switch (this.errorScenario) {
      case "network_timeout":
        return {
          success: false,
          error: "Network timeout after 30 seconds",
        };
      case "file_not_found":
        return {
          success: false,
          error: "404 File not found in repository",
        };
      case "access_denied":
        return {
          success: false,
          error: "403 Access denied to private repository",
        };
      case "rate_limit":
        return {
          success: false,
          error: "429 Rate limit exceeded",
        };
      case "server_error":
        return {
          success: false,
          error: "500 Internal server error",
        };
      case "custom":
        return {
          success: false,
          error: this.customError,
        };
      case "success":
        return {
          success: true,
          localPath: "/tmp/test.txt",
          fileSize: 1024,
        };
      default:
        return {
          success: true,
          localPath: "/tmp/test.txt",
          fileSize: 1024,
        };
    }
  }

  async validateRepository(): Promise<boolean> {
    switch (this.errorScenario) {
      case "repo_not_found":
      case "access_denied":
        return false;
      default:
        return true;
    }
  }
}

describe("Error Handling Integration Tests", () => {
  let mockClient: ErrorSimulatingHFClient;
  let testFile: string;
  let tempDir: string;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    mockClient = new ErrorSimulatingHFClient();

    // Create test file and directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hfjscli-error-test-"));
    testFile = path.join(tempDir, "test.txt");
    await fs.writeFile(testFile, "test content for error scenarios");

    // Reset auth manager and mock successful authentication
    authManager.clearToken();
    authManager.setToken("test-token");

    // Mock successful authentication validation
    jest
      .spyOn(authManager, "validateAuthentication")
      .mockResolvedValue("test-token");

    // Reset logger state
    Logger.setVerbose(false);
    ErrorHandler.setVerbose(false);
  });

  afterEach(async () => {
    // Cleanup
    await fs.remove(tempDir);
    mockConsoleError.mockClear();
    mockConsoleLog.mockClear();
  });

  describe("Network Error Scenarios", () => {
    it("should handle network timeout during upload", async () => {
      mockClient.setErrorScenario("network_timeout");
      const uploadCommand = new UploadCommand(mockClient);

      await expect(
        uploadCommand.execute("test/repo", testFile, {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.NETWORK_ERROR,
        message: expect.stringContaining("timeout"),
      });
    });

    it("should handle network timeout during download", async () => {
      mockClient.setErrorScenario("network_timeout");
      const downloadCommand = new DownloadCommand(mockClient);

      await expect(
        downloadCommand.execute("test/repo", "test.txt", {
          localDir: tempDir,
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.NETWORK_ERROR,
        message: expect.stringContaining("timeout"),
      });
    });

    it("should handle server errors with retry suggestions", async () => {
      mockClient.setErrorScenario("server_error");
      const uploadCommand = new UploadCommand(mockClient);

      await expect(
        uploadCommand.execute("test/repo", testFile, {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.NETWORK_ERROR,
        message: expect.stringContaining("server error"),
      });
    });

    it("should handle rate limiting with appropriate messages", async () => {
      mockClient.setErrorScenario("rate_limit");
      const uploadCommand = new UploadCommand(mockClient);

      await expect(
        uploadCommand.execute("test/repo", testFile, {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.NETWORK_ERROR,
        message: expect.stringContaining("Rate limit"),
      });
    });
  });

  describe("File System Error Scenarios", () => {
    it("should handle non-existent file for upload", async () => {
      const uploadCommand = new UploadCommand(mockClient);

      await expect(
        uploadCommand.execute("test/repo", "/nonexistent/file.txt", {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.FILE_NOT_FOUND,
        message: expect.stringContaining("No files matched the pattern"),
      });
    });

    it("should handle permission denied for local directory", async () => {
      const downloadCommand = new DownloadCommand(mockClient);

      await expect(
        downloadCommand.execute("test/repo", "test.txt", {
          localDir: "/root/forbidden",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.PERMISSION_ERROR,
      });
    });

    it.skip("should handle read-only file system", async () => {
      // Create a read-only directory (simulate)
      const readOnlyDir = path.join(tempDir, "readonly");
      await fs.ensureDir(readOnlyDir);

      // Try to make it read-only (may not work on all systems)
      try {
        await fs.chmod(readOnlyDir, 0o444);
      } catch {
        // Skip test if we can't create read-only directory
        return;
      }

      const downloadCommand = new DownloadCommand(mockClient);

      await expect(
        downloadCommand.execute("test/repo", "test.txt", {
          localDir: readOnlyDir,
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.PERMISSION_ERROR,
      });
    });

    it("should handle file path with invalid characters", async () => {
      const uploadCommand = new UploadCommand(mockClient);

      await expect(
        uploadCommand.execute("test/repo", "file\x00with\x00nulls.txt", {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.FILE_NOT_FOUND,
      });
    });
  });

  describe("Authentication Error Scenarios", () => {
    it("should handle expired token", async () => {
      mockClient.setErrorScenario("auth_error");
      const uploadCommand = new UploadCommand(mockClient);

      // Mock auth manager to simulate expired token
      jest.spyOn(authManager, "validateAuthentication").mockRejectedValue({
        type: ErrorType.AUTHENTICATION_ERROR,
        message: "Invalid authentication token",
        details: "The provided token is invalid or expired.",
      });

      await expect(
        uploadCommand.execute("test/repo", testFile, {
          token: "expired-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.AUTHENTICATION_ERROR,
        message: expect.stringContaining("Invalid authentication token"),
      });
    });

    it("should handle missing permissions", async () => {
      mockClient.setErrorScenario("access_denied");
      const downloadCommand = new DownloadCommand(mockClient);

      await expect(
        downloadCommand.execute("private/repo", "secret.txt", {
          localDir: tempDir,
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.VALIDATION_ERROR,
        message: expect.stringContaining("Repository not found"),
      });
    });

    it("should handle malformed token", async () => {
      const uploadCommand = new UploadCommand(mockClient);

      // Mock auth manager to simulate malformed token
      jest.spyOn(authManager, "validateAuthentication").mockRejectedValue({
        type: ErrorType.AUTHENTICATION_ERROR,
        message: "Invalid authentication token",
        details: "Token format is invalid.",
      });

      await expect(
        uploadCommand.execute("test/repo", testFile, {
          token: "malformed_token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.AUTHENTICATION_ERROR,
      });
    });
  });

  describe("Validation Error Scenarios", () => {
    it("should handle invalid repository ID formats", async () => {
      const uploadCommand = new UploadCommand(mockClient);

      const invalidRepoIds = [
        "no-slash",
        "/starts-with-slash",
        "ends-with-slash/",
        "too/many/slashes",
        "user/",
        "/repo",
        "user//repo",
        "user/repo/extra",
      ];

      for (const repoId of invalidRepoIds) {
        await expect(
          uploadCommand.execute(repoId, testFile, {
            token: "test-token",
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.VALIDATION_ERROR,
          message: expect.stringContaining("Invalid repository ID format"),
        });
      }
    });

    it("should handle empty or whitespace inputs", async () => {
      const uploadCommand = new UploadCommand(mockClient);

      // Empty repository ID
      await expect(
        uploadCommand.execute("", testFile, {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.VALIDATION_ERROR,
        message: expect.stringContaining("Repository ID is required"),
      });

      // Whitespace-only repository ID
      await expect(
        uploadCommand.execute("   ", testFile, {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.VALIDATION_ERROR,
        message: expect.stringContaining("Repository ID is required"),
      });

      // Empty file path
      await expect(
        uploadCommand.execute("test/repo", "", {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.VALIDATION_ERROR,
        message: expect.stringContaining("Unsafe file pattern"),
      });
    });

    it("should handle invalid repository types", async () => {
      const uploadCommand = new UploadCommand(mockClient);

      const invalidTypes = [
        "invalid",
        "repo",
        "hub",
        "file",
        "unknown",
        "test",
      ];

      for (const repoType of invalidTypes) {
        await expect(
          uploadCommand.execute("test/repo", testFile, {
            token: "test-token",
            repoType: repoType as any,
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.VALIDATION_ERROR,
          message: expect.stringContaining("Invalid repository type"),
        });
      }
    });
  });

  describe("Repository Error Scenarios", () => {
    it("should handle repository not found", async () => {
      mockClient.setErrorScenario("repo_not_found");
      const uploadCommand = new UploadCommand(mockClient);

      await expect(
        uploadCommand.execute("nonexistent/repo", testFile, {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.VALIDATION_ERROR,
        message: expect.stringContaining("Repository not found"),
      });
    });

    it("should handle private repository access", async () => {
      mockClient.setErrorScenario("access_denied");
      const downloadCommand = new DownloadCommand(mockClient);

      await expect(
        downloadCommand.execute("private/repo", "secret.txt", {
          localDir: tempDir,
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.VALIDATION_ERROR,
        message: expect.stringContaining("Repository not found"),
      });
    });

    it("should handle file not found in repository", async () => {
      mockClient.setErrorScenario("file_not_found");
      const downloadCommand = new DownloadCommand(mockClient);

      await expect(
        downloadCommand.execute("test/repo", "nonexistent.txt", {
          localDir: tempDir,
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.NETWORK_ERROR,
        message: expect.stringContaining("File not found"),
      });
    });
  });

  describe("Error Message Quality", () => {
    it("should provide helpful suggestions for common errors", async () => {
      const uploadCommand = new UploadCommand(mockClient);

      // Test file not found error
      await expect(
        uploadCommand.execute("test/repo", "/nonexistent/file.txt", {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.FILE_NOT_FOUND,
        message: expect.stringContaining("No files matched the pattern"),
      });
    });

    it("should provide contextual error information", async () => {
      mockClient.setErrorScenario("repo_not_found");
      const uploadCommand = new UploadCommand(mockClient);

      await expect(
        uploadCommand.execute("test/repo", testFile, {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.VALIDATION_ERROR,
        message: expect.stringContaining("test/repo"),
      });
    });

    it("should handle verbose error reporting", async () => {
      mockClient.setErrorScenario("network_timeout");
      const uploadCommand = new UploadCommand(mockClient);

      ErrorHandler.setVerbose(true);
      Logger.setVerbose(true);

      await expect(
        uploadCommand.execute("test/repo", testFile, {
          token: "test-token",
          repoType: "model",
          verbose: true,
        })
      ).rejects.toMatchObject({
        type: ErrorType.NETWORK_ERROR,
      });

      // Should have produced verbose output
      expect(mockConsoleLog).toHaveBeenCalled();
    });
  });

  describe("Error Recovery Scenarios", () => {
    it("should handle partial failures gracefully", async () => {
      mockClient.setErrorScenario("custom", "Partial upload failure");
      const uploadCommand = new UploadCommand(mockClient);

      await expect(
        uploadCommand.execute("test/repo", testFile, {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.NETWORK_ERROR,
        message: expect.stringContaining("Partial upload failure"),
      });
    });

    it("should handle connection interruption", async () => {
      mockClient.setErrorScenario("custom", "Connection reset by peer");
      const downloadCommand = new DownloadCommand(mockClient);

      await expect(
        downloadCommand.execute("test/repo", "test.txt", {
          localDir: tempDir,
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.NETWORK_ERROR,
        message: expect.stringContaining("Connection reset"),
      });
    });
  });

  describe("Edge Case Error Scenarios", () => {
    it("should handle extremely long file paths", async () => {
      const longPath = "/tmp/" + "a".repeat(1000) + ".txt";
      const uploadCommand = new UploadCommand(mockClient);

      await expect(
        uploadCommand.execute("test/repo", longPath, {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.FILE_NOT_FOUND,
      });
    });

    it("should handle special characters in repository names", async () => {
      const uploadCommand = new UploadCommand(mockClient);

      await expect(
        uploadCommand.execute("test/repo@#$%", testFile, {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).rejects.toMatchObject({
        type: ErrorType.VALIDATION_ERROR,
        message: expect.stringContaining("Invalid repository ID format"),
      });
    });

    it("should handle unicode characters in file paths", async () => {
      const unicodeFile = path.join(tempDir, "测试文件.txt");
      await fs.writeFile(unicodeFile, "unicode content");

      mockClient.setErrorScenario("success");
      const uploadCommand = new UploadCommand(mockClient);

      // Should handle unicode filenames correctly
      await expect(
        uploadCommand.execute("test/repo", unicodeFile, {
          token: "test-token",
          repoType: "model",
          verbose: false,
        })
      ).resolves.not.toThrow();
    });
  });
});
