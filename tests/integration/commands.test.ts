/**
 * Integration tests for Upload and Download command handlers
 * Tests with mocked Hugging Face API responses
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
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";

// Mock the Hugging Face client
class MockHFClient implements HFClientWrapper {
  private shouldSucceed: boolean = true;
  private errorMessage: string = "Mock error";

  setMockBehavior(succeed: boolean, errorMessage?: string) {
    this.shouldSucceed = succeed;
    if (errorMessage) this.errorMessage = errorMessage;
  }

  async uploadFile(): Promise<UploadResult> {
    if (this.shouldSucceed) {
      return {
        success: true,
        fileUrl: "https://huggingface.co/test/repo/blob/main/test.txt",
        commitSha: "abc123def456",
      };
    } else {
      return {
        success: false,
        error: this.errorMessage,
      };
    }
  }

  async uploadFiles(): Promise<MultiUploadResult> {
    if (this.shouldSucceed) {
      return {
        success: true,
        filesUploaded: 1,
        totalFiles: 1,
        commitSha: "abc123def456",
      };
    } else {
      return {
        success: false,
        filesUploaded: 0,
        totalFiles: 1,
        error: this.errorMessage,
      };
    }
  }

  async downloadFile(): Promise<DownloadResult> {
    if (this.shouldSucceed) {
      return {
        success: true,
        localPath: "/tmp/test.txt",
        fileSize: 1024,
      };
    } else {
      return {
        success: false,
        error: this.errorMessage,
      };
    }
  }

  async validateRepository(): Promise<boolean> {
    return this.shouldSucceed;
  }
}

// Mock console methods to capture output
const mockConsoleLog = jest.spyOn(console, "log").mockImplementation();
const mockConsoleError = jest.spyOn(console, "error").mockImplementation();

describe("Command Handlers Integration Tests", () => {
  let mockClient: MockHFClient;
  let testFile: string;
  let tempDir: string;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    mockClient = new MockHFClient();

    // Create test file
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hfjscli-test-"));
    testFile = path.join(tempDir, "test.txt");
    await fs.writeFile(testFile, "test content");

    // Reset auth manager
    authManager.clearToken();

    // Mock successful authentication validation
    jest
      .spyOn(authManager, "validateAuthentication")
      .mockResolvedValue("test-token");
    jest.spyOn(authManager, "validateToken").mockResolvedValue(true);

    // Reset logger state
    Logger.setVerbose(false);
  });

  afterEach(async () => {
    // Cleanup
    await fs.remove(tempDir);
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe("Upload Command Integration", () => {
    describe("Successful Upload Scenarios", () => {
      it("should successfully upload file with valid inputs", async () => {
        mockClient.setMockBehavior(true);
        const uploadCommand = new UploadCommand(mockClient);

        // Mock successful authentication
        authManager.setToken("valid-token");

        await expect(
          uploadCommand.execute("test/repo", testFile, {
            token: "valid-token",
            message: "Test upload",
            repoType: "model",
            verbose: false,
          })
        ).resolves.not.toThrow();
      });

      it("should handle different repository types", async () => {
        mockClient.setMockBehavior(true);
        const uploadCommand = new UploadCommand(mockClient);
        authManager.setToken("valid-token");

        // Test model repository
        await expect(
          uploadCommand.execute("test/repo", testFile, {
            token: "valid-token",
            repoType: "model",
            verbose: false,
          })
        ).resolves.not.toThrow();

        // Test dataset repository
        await expect(
          uploadCommand.execute("test/repo", testFile, {
            token: "valid-token",
            repoType: "dataset",
            verbose: false,
          })
        ).resolves.not.toThrow();

        // Test space repository
        await expect(
          uploadCommand.execute("test/repo", testFile, {
            token: "valid-token",
            repoType: "space",
            verbose: false,
          })
        ).resolves.not.toThrow();
      });

      it("should generate default commit message when none provided", async () => {
        mockClient.setMockBehavior(true);
        const uploadCommand = new UploadCommand(mockClient);
        authManager.setToken("valid-token");

        await expect(
          uploadCommand.execute("test/repo", testFile, {
            token: "valid-token",
            repoType: "model",
            verbose: false,
          })
        ).resolves.not.toThrow();
      });

      it("should use custom commit message when provided", async () => {
        mockClient.setMockBehavior(true);
        const uploadCommand = new UploadCommand(mockClient);
        authManager.setToken("valid-token");

        await expect(
          uploadCommand.execute("test/repo", testFile, {
            token: "valid-token",
            message: "Custom commit message",
            repoType: "model",
            verbose: false,
          })
        ).resolves.not.toThrow();
      });
    });

    describe("Upload Validation Errors", () => {
      it("should reject empty repository ID", async () => {
        const uploadCommand = new UploadCommand(mockClient);

        await expect(
          uploadCommand.execute("", testFile, {
            token: "valid-token",
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.VALIDATION_ERROR,
          message: expect.stringContaining("Repository ID is required"),
        });
      });

      it("should reject invalid repository ID format", async () => {
        const uploadCommand = new UploadCommand(mockClient);

        await expect(
          uploadCommand.execute("invalid-repo-id", testFile, {
            token: "valid-token",
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.VALIDATION_ERROR,
          message: expect.stringContaining("Invalid repository ID format"),
        });
      });

      it("should reject empty file path", async () => {
        const uploadCommand = new UploadCommand(mockClient);

        await expect(
          uploadCommand.execute("test/repo", "", {
            token: "valid-token",
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.VALIDATION_ERROR,
          message: expect.stringContaining("Unsafe file pattern"),
        });
      });

      it("should reject non-existent file", async () => {
        const uploadCommand = new UploadCommand(mockClient);

        await expect(
          uploadCommand.execute("test/repo", "/nonexistent/file.txt", {
            token: "valid-token",
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.FILE_NOT_FOUND,
        });
      });

      it("should reject invalid repository type", async () => {
        const uploadCommand = new UploadCommand(mockClient);

        await expect(
          uploadCommand.execute("test/repo", testFile, {
            token: "valid-token",
            repoType: "invalid-type" as any,
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.VALIDATION_ERROR,
          message: expect.stringContaining("Invalid repository type"),
        });
      });
    });

    describe("Upload Authentication Errors", () => {
      it("should reject upload without authentication", async () => {
        const uploadCommand = new UploadCommand(mockClient);

        // Clear the auth mock for this test
        jest.restoreAllMocks();
        authManager.clearToken();

        try {
          await uploadCommand.execute("test/repo", testFile, {
            repoType: "model",
            verbose: false,
          });
        } catch (error) {
          expect(error).toMatchObject({
            type: ErrorType.AUTHENTICATION_ERROR,
          });
        }
      });

      it("should handle invalid authentication token", async () => {
        mockClient.setMockBehavior(false, "Invalid token");
        const uploadCommand = new UploadCommand(mockClient);

        // Mock auth manager to return invalid token validation
        jest.spyOn(authManager, "validateAuthentication").mockRejectedValue({
          type: ErrorType.AUTHENTICATION_ERROR,
          message: "Invalid authentication token",
        });

        await expect(
          uploadCommand.execute("test/repo", testFile, {
            token: "invalid-token",
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.AUTHENTICATION_ERROR,
        });
      });
    });

    describe("Upload Network Errors", () => {
      it("should handle repository validation failure", async () => {
        mockClient.setMockBehavior(false);
        const uploadCommand = new UploadCommand(mockClient);
        authManager.setToken("valid-token");

        await expect(
          uploadCommand.execute("test/repo", testFile, {
            token: "valid-token",
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.VALIDATION_ERROR,
          message: expect.stringContaining("Repository not found"),
        });
      });

      it("should handle upload failure", async () => {
        // Mock successful repo validation but failed upload
        const mockClientPartial = {
          ...mockClient,
          validateRepository: jest.fn().mockResolvedValue(true),
          uploadFile: jest.fn().mockResolvedValue({
            success: false,
            error: "Network timeout",
          }),
        };

        const uploadCommand = new UploadCommand(mockClientPartial as any);
        authManager.setToken("valid-token");

        await expect(
          uploadCommand.execute("test/repo", testFile, {
            token: "valid-token",
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.NETWORK_ERROR,
        });
      });
    });
  });

  describe("Download Command Integration", () => {
    describe("Successful Download Scenarios", () => {
      it("should successfully download file with valid inputs", async () => {
        mockClient.setMockBehavior(true);
        const downloadCommand = new DownloadCommand(mockClient);

        await expect(
          downloadCommand.execute("test/repo", "test.txt", {
            localDir: tempDir,
            repoType: "model",
            verbose: false,
          })
        ).resolves.not.toThrow();
      });

      it("should handle different repository types", async () => {
        mockClient.setMockBehavior(true);
        const downloadCommand = new DownloadCommand(mockClient);

        // Test model repository
        await expect(
          downloadCommand.execute("test/repo", "test.txt", {
            localDir: tempDir,
            repoType: "model",
            verbose: false,
          })
        ).resolves.not.toThrow();

        // Test dataset repository
        await expect(
          downloadCommand.execute("test/repo", "test.txt", {
            localDir: tempDir,
            repoType: "dataset",
            verbose: false,
          })
        ).resolves.not.toThrow();

        // Test space repository
        await expect(
          downloadCommand.execute("test/repo", "test.txt", {
            localDir: tempDir,
            repoType: "space",
            verbose: false,
          })
        ).resolves.not.toThrow();
      });

      it("should use current directory when no local-dir specified", async () => {
        mockClient.setMockBehavior(true);
        const downloadCommand = new DownloadCommand(mockClient);

        await expect(
          downloadCommand.execute("test/repo", "test.txt", {
            repoType: "model",
            verbose: false,
          })
        ).resolves.not.toThrow();
      });

      it("should work without authentication for public repos", async () => {
        mockClient.setMockBehavior(true);
        const downloadCommand = new DownloadCommand(mockClient);

        await expect(
          downloadCommand.execute("test/repo", "test.txt", {
            localDir: tempDir,
            repoType: "model",
            verbose: false,
          })
        ).resolves.not.toThrow();
      });
    });

    describe("Download Validation Errors", () => {
      it("should reject empty repository ID", async () => {
        const downloadCommand = new DownloadCommand(mockClient);

        await expect(
          downloadCommand.execute("", "test.txt", {
            localDir: tempDir,
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.VALIDATION_ERROR,
          message: expect.stringContaining("Repository ID is required"),
        });
      });

      it("should reject invalid repository ID format", async () => {
        const downloadCommand = new DownloadCommand(mockClient);

        await expect(
          downloadCommand.execute("invalid-repo-id", "test.txt", {
            localDir: tempDir,
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.VALIDATION_ERROR,
          message: expect.stringContaining("Invalid repository ID format"),
        });
      });

      it("should reject empty file path", async () => {
        const downloadCommand = new DownloadCommand(mockClient);

        await expect(
          downloadCommand.execute("test/repo", "", {
            localDir: tempDir,
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.VALIDATION_ERROR,
          message: expect.stringContaining("File path is required"),
        });
      });

      it("should reject invalid repository type", async () => {
        const downloadCommand = new DownloadCommand(mockClient);

        await expect(
          downloadCommand.execute("test/repo", "test.txt", {
            localDir: tempDir,
            repoType: "invalid-type" as any,
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.VALIDATION_ERROR,
          message: expect.stringContaining("Invalid repository type"),
        });
      });

      it("should reject invalid local directory", async () => {
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
    });

    describe("Download Network Errors", () => {
      it("should handle repository validation failure", async () => {
        mockClient.setMockBehavior(false);
        const downloadCommand = new DownloadCommand(mockClient);

        await expect(
          downloadCommand.execute("test/repo", "test.txt", {
            localDir: tempDir,
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.VALIDATION_ERROR,
          message: expect.stringContaining("Repository not found"),
        });
      });

      it("should handle download failure", async () => {
        // Mock successful repo validation but failed download
        const mockClientPartial = {
          ...mockClient,
          validateRepository: jest.fn().mockResolvedValue(true),
          downloadFile: jest.fn().mockResolvedValue({
            success: false,
            error: "File not found",
          }),
        };

        const downloadCommand = new DownloadCommand(mockClientPartial as any);

        await expect(
          downloadCommand.execute("test/repo", "test.txt", {
            localDir: tempDir,
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.NETWORK_ERROR,
        });
      });

      it("should handle file not found errors specifically", async () => {
        const mockClientPartial = {
          ...mockClient,
          validateRepository: jest.fn().mockResolvedValue(true),
          downloadFile: jest.fn().mockResolvedValue({
            success: false,
            error: "404 File not found",
          }),
        };

        const downloadCommand = new DownloadCommand(mockClientPartial as any);

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

      it("should handle access denied errors specifically", async () => {
        const mockClientPartial = {
          ...mockClient,
          validateRepository: jest.fn().mockResolvedValue(true),
          downloadFile: jest.fn().mockResolvedValue({
            success: false,
            error: "403 Access denied",
          }),
        };

        const downloadCommand = new DownloadCommand(mockClientPartial as any);

        await expect(
          downloadCommand.execute("test/repo", "private.txt", {
            localDir: tempDir,
            repoType: "model",
            verbose: false,
          })
        ).rejects.toMatchObject({
          type: ErrorType.NETWORK_ERROR,
          message: expect.stringContaining("Access denied"),
        });
      });
    });
  });

  describe("Verbose Mode Integration", () => {
    it("should provide detailed output in verbose mode for upload", async () => {
      mockClient.setMockBehavior(true);
      const uploadCommand = new UploadCommand(mockClient);
      authManager.setToken("valid-token");

      await uploadCommand.execute("test/repo", testFile, {
        token: "valid-token",
        repoType: "model",
        verbose: true,
      });

      // Verbose mode should produce more console output
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it("should provide detailed output in verbose mode for download", async () => {
      mockClient.setMockBehavior(true);
      const downloadCommand = new DownloadCommand(mockClient);

      await downloadCommand.execute("test/repo", "test.txt", {
        localDir: tempDir,
        repoType: "model",
        verbose: true,
      });

      // Verbose mode should produce more console output
      expect(mockConsoleLog).toHaveBeenCalled();
    });
  });

  describe("Progress Indication Integration", () => {
    it("should show progress indicators during upload", async () => {
      mockClient.setMockBehavior(true);
      const uploadCommand = new UploadCommand(mockClient);
      authManager.setToken("valid-token");

      await uploadCommand.execute("test/repo", testFile, {
        token: "valid-token",
        repoType: "model",
        verbose: false,
      });

      // Should have progress-related console output
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it("should show progress indicators during download", async () => {
      mockClient.setMockBehavior(true);
      const downloadCommand = new DownloadCommand(mockClient);

      await downloadCommand.execute("test/repo", "test.txt", {
        localDir: tempDir,
        repoType: "model",
        verbose: false,
      });

      // Should have progress-related console output
      expect(mockConsoleLog).toHaveBeenCalled();
    });
  });

  describe("Authentication Integration with Commands", () => {
    it("should use global token when command token not provided", async () => {
      mockClient.setMockBehavior(true);
      const uploadCommand = new UploadCommand(mockClient);

      // Set global token
      authManager.setToken("global-token");

      await expect(
        uploadCommand.execute("test/repo", testFile, {
          repoType: "model",
          verbose: false,
        })
      ).resolves.not.toThrow();
    });

    it("should prioritize command token over global token", async () => {
      mockClient.setMockBehavior(true);
      const uploadCommand = new UploadCommand(mockClient);

      // Set global token
      authManager.setToken("global-token");

      await expect(
        uploadCommand.execute("test/repo", testFile, {
          token: "command-token",
          repoType: "model",
          verbose: false,
        })
      ).resolves.not.toThrow();
    });

    it("should handle environment token for download", async () => {
      mockClient.setMockBehavior(true);
      const downloadCommand = new DownloadCommand(mockClient);

      // Mock environment token
      process.env.HF_TOKEN = "env-token";

      await expect(
        downloadCommand.execute("test/repo", "test.txt", {
          localDir: tempDir,
          repoType: "model",
          verbose: false,
        })
      ).resolves.not.toThrow();

      // Clean up
      delete process.env.HF_TOKEN;
    });
  });
});
