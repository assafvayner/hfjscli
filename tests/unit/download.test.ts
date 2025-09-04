/**
 * Unit tests for Download Command Handler
 */

import { DownloadCommand } from "../../src/commands/download";
import { HFClientWrapper } from "../../src/types";
import { authManager } from "../../src/auth/manager";
import { FileSystemUtils } from "../../src/utils/files";
import * as path from "path";
import { Logger } from "../../src/utils/logger";

// Mock dependencies
jest.mock("../../src/auth/manager");
jest.mock("../../src/utils/files");
jest.mock("ora", () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
  }));
});

// Mock console methods
const mockConsoleLog = jest.spyOn(console, "log").mockImplementation();
const mockConsoleError = jest.spyOn(console, "error").mockImplementation();
const mockProcessExit = jest.spyOn(process, "exit").mockImplementation();

describe("DownloadCommand", () => {
  let downloadCommand: DownloadCommand;
  let mockHFClient: jest.Mocked<HFClientWrapper>;
  let mockAuthManager: jest.Mocked<typeof authManager>;
  let mockFileSystemUtils: jest.Mocked<typeof FileSystemUtils>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock HF client
    mockHFClient = {
      downloadFile: jest.fn(),
      uploadFile: jest.fn(),
      uploadFiles: jest.fn(),
      validateRepository: jest.fn(),
    };

    // Create download command with mocked client
    downloadCommand = new DownloadCommand(mockHFClient);

    // Setup auth manager mock
    mockAuthManager = authManager as jest.Mocked<typeof authManager>;
    mockAuthManager.getToken = jest.fn();
    mockAuthManager.setToken = jest.fn();

    // Setup file system utils mock
    mockFileSystemUtils = FileSystemUtils as jest.Mocked<
      typeof FileSystemUtils
    >;
    mockFileSystemUtils.resolvePath = jest.fn((p) => path.resolve(p));
    mockFileSystemUtils.validateDirectoryPath = jest.fn();
  });

  afterEach(() => {
    Logger.setToDefault();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  describe("execute", () => {
    it("should successfully download a file", async () => {
      // Setup mocks for successful download
      mockFileSystemUtils.validateDirectoryPath.mockResolvedValue({
        valid: true,
      });
      mockAuthManager.getToken.mockReturnValue("test-token");
      mockHFClient.validateRepository.mockResolvedValue(true);
      mockHFClient.downloadFile.mockResolvedValue({
        success: true,
        localPath: "/current/dir/test.txt",
        fileSize: 1024,
      });

      await downloadCommand.execute("username/repo", "test.txt", {
        localDir: "/current/dir",
        repoType: "model",
        verbose: false,
      });

      expect(mockHFClient.downloadFile).toHaveBeenCalledWith({
        repoId: "username/repo",
        filePath: "test.txt",
        localDir: path.resolve("/current/dir"),
        token: "test-token",
        repoType: "model",
        verbose: false,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("✅ Download successful!")
      );
    });

    it("should use current directory when no local directory is specified", async () => {
      mockFileSystemUtils.validateDirectoryPath.mockResolvedValue({
        valid: true,
      });
      mockAuthManager.getToken.mockReturnValue(null);
      mockHFClient.validateRepository.mockResolvedValue(true);
      mockHFClient.downloadFile.mockResolvedValue({
        success: true,
        localPath: process.cwd() + "/test.txt",
        fileSize: 1024,
      });

      await downloadCommand.execute("username/repo", "test.txt", {
        repoType: "model",
        verbose: false,
      });

      expect(mockHFClient.downloadFile).toHaveBeenCalledWith({
        repoId: "username/repo",
        filePath: "test.txt",
        localDir: process.cwd(),
        token: undefined,
        repoType: "model",
        verbose: false,
      });
    });

    it("should handle authentication token from options", async () => {
      mockFileSystemUtils.validateDirectoryPath.mockResolvedValue({
        valid: true,
      });
      mockAuthManager.getToken.mockReturnValue("env-token");
      mockHFClient.validateRepository.mockResolvedValue(true);
      mockHFClient.downloadFile.mockResolvedValue({
        success: true,
        localPath: "/current/dir/test.txt",
        fileSize: 1024,
      });

      await downloadCommand.execute("username/repo", "test.txt", {
        token: "option-token",
        repoType: "model",
        verbose: false,
      });

      expect(mockAuthManager.setToken).toHaveBeenCalledWith("option-token");
    });

    it("should validate repository before downloading", async () => {
      mockFileSystemUtils.validateDirectoryPath.mockResolvedValue({
        valid: true,
      });
      mockAuthManager.getToken.mockReturnValue("test-token");
      mockHFClient.validateRepository.mockResolvedValue(false);

      let err: Error | null = null;
      try {
        await downloadCommand.execute("username/repo", "test.txt", {
          repoType: "model",
          verbose: false,
        });
      } catch (error) {
        err = error as Error;
      }

      expect(mockHFClient.validateRepository).toHaveBeenCalledWith(
        "username/repo",
        "model"
      );
      expect(err).not.toBeNull();
      expect(err?.message).toContain("Repository not found or not accessible");
    });
  });

  describe("input validation", () => {
    it("should reject empty repository ID", async () => {
      let err: Error | null = null;
      try {
        await downloadCommand.execute("", "test.txt", {
          repoType: "model",
          verbose: false,
        });
      } catch (error) {
        err = error as Error;
      }

      expect(err).not.toBeNull();
      expect(err?.message).toContain("Repository ID is required");
    });

    it("should reject invalid repository ID format", async () => {
      let err: Error | null = null;
      try {
        await downloadCommand.execute("invalid-repo-id", "test.txt", {
          repoType: "model",
          verbose: false,
        });
      } catch (error) {
        err = error as Error;
      }

      expect(err).not.toBeNull();
      expect(err?.message).toContain("Invalid repository ID format");
    });

    it("should reject empty file path", async () => {
      let err: Error | null = null;
      try {
        await downloadCommand.execute("username/repo", "", {
          repoType: "model",
          verbose: false,
        });
      } catch (error) {
        err = error as Error;
      }

      expect(err).not.toBeNull();
      expect(err?.message).toContain("File path is required");
    });

    it("should reject invalid repository type", async () => {
      let err: Error | null = null;
      try {
        await downloadCommand.execute("username/repo", "test.txt", {
          repoType: "invalid",
          verbose: false,
        });
      } catch (error) {
        err = error as Error;
      }

      expect(err).not.toBeNull();
      expect(err?.message).toContain("Invalid repository type");
    });

    it("should validate local directory path", async () => {
      mockFileSystemUtils.validateDirectoryPath.mockResolvedValue({
        valid: false,
        error: "Directory does not exist",
      });

      let err: Error | null = null;
      try {
        await downloadCommand.execute("username/repo", "test.txt", {
          localDir: "/nonexistent/dir",
          repoType: "model",
          verbose: false,
        });
      } catch (error) {
        err = error as Error;
      }

      expect(mockFileSystemUtils.validateDirectoryPath).toHaveBeenCalledWith(
        path.resolve("/nonexistent/dir")
      );
      expect(err).not.toBeNull();
      expect(err?.message).toContain("Directory does not exist");
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      mockFileSystemUtils.validateDirectoryPath.mockResolvedValue({
        valid: true,
      });
      mockAuthManager.getToken.mockReturnValue("test-token");
      mockHFClient.validateRepository.mockResolvedValue(true);
    });

    it("should handle file not found errors", async () => {
      mockHFClient.downloadFile.mockResolvedValue({
        success: false,
        error: "404 File not found",
      });

      let err: Error | null = null;
      try {
        await downloadCommand.execute("username/repo", "nonexistent.txt", {
          repoType: "model",
          verbose: false,
        });
      } catch (error) {
        err = error as Error;
      }

      expect(err).not.toBeNull();
      expect(err?.message).toContain("File not found: nonexistent.txt");
    });

    it("should handle permission errors", async () => {
      mockHFClient.downloadFile.mockResolvedValue({
        success: false,
        error: "403 Access denied",
      });

      let err: Error | null = null;
      try {
        await downloadCommand.execute("username/private-repo", "test.txt", {
          repoType: "model",
          verbose: false,
        });
      } catch (error) {
        err = error as Error;
      }

      expect(err).not.toBeNull();
      expect(err?.message).toContain("Access denied to the repository or file");
    });

    it("should handle network errors", async () => {
      mockHFClient.downloadFile.mockResolvedValue({
        success: false,
        error: "Network timeout",
      });

      let err: any = null;
      try {
        await downloadCommand.execute("username/repo", "test.txt", {
          repoType: "model",
          verbose: false,
        });
      } catch (error) {
        err = error;
      }

      expect(err).not.toBeNull();
      expect(err.message).toContain("Network timeout");
    });

    it("should handle unexpected errors during download", async () => {
      mockHFClient.downloadFile.mockRejectedValue(
        new Error("Unexpected error")
      );

      let err: Error | null = null;
      try {
        await downloadCommand.execute("username/repo", "test.txt", {
          repoType: "model",
          verbose: false,
        });
      } catch (error) {
        err = error as Error;
      }

      expect(err).not.toBeNull();
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe("Unexpected error");
    });
  });

  describe("repository type handling", () => {
    beforeEach(() => {
      mockFileSystemUtils.validateDirectoryPath.mockResolvedValue({
        valid: true,
      });
      mockAuthManager.getToken.mockReturnValue("test-token");
      mockHFClient.validateRepository.mockResolvedValue(true);
      mockHFClient.downloadFile.mockResolvedValue({
        success: true,
        localPath: "/current/dir/test.txt",
        fileSize: 1024,
      });
    });

    it("should handle model repository type", async () => {
      await downloadCommand.execute("username/repo", "test.txt", {
        repoType: "model",
        verbose: false,
      });

      expect(mockHFClient.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({ repoType: "model" })
      );
    });

    it("should handle dataset repository type", async () => {
      await downloadCommand.execute("username/repo", "test.txt", {
        repoType: "dataset",
        verbose: false,
      });

      expect(mockHFClient.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({ repoType: "dataset" })
      );
    });

    it("should handle space repository type", async () => {
      await downloadCommand.execute("username/repo", "test.txt", {
        repoType: "space",
        verbose: false,
      });

      expect(mockHFClient.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({ repoType: "space" })
      );
    });

    it("should default to model repository type when not specified", async () => {
      await downloadCommand.execute("username/repo", "test.txt", {
        verbose: false,
      });

      expect(mockHFClient.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({ repoType: "model" })
      );
    });
  });

  describe("verbose logging", () => {
    beforeEach(() => {
      mockFileSystemUtils.validateDirectoryPath.mockResolvedValue({
        valid: true,
      });
      mockAuthManager.getToken.mockReturnValue("test-token");
      mockHFClient.validateRepository.mockResolvedValue(true);
      mockHFClient.downloadFile.mockResolvedValue({
        success: true,
        localPath: "/current/dir/test.txt",
        fileSize: 1024,
      });
    });

    it("should show verbose logs when verbose mode is enabled", async () => {
      await downloadCommand.execute("username/repo", "test.txt", {
        repoType: "model",
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("[VERBOSE]")
      );
    });

    it("should not show verbose logs when verbose mode is disabled", async () => {
      await downloadCommand.execute("username/repo", "test.txt", {
        repoType: "model",
        verbose: false,
      });

      const verboseCalls = mockConsoleLog.mock.calls.filter((call) =>
        call[0]?.includes("[VERBOSE]")
      );
      expect(verboseCalls).toHaveLength(0);
    });

    it("should show file size in verbose mode", async () => {
      await downloadCommand.execute("username/repo", "test.txt", {
        repoType: "model",
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Size: 1.0 KB")
      );
    });
  });

  describe("success message formatting", () => {
    beforeEach(() => {
      mockFileSystemUtils.validateDirectoryPath.mockResolvedValue({
        valid: true,
      });
      mockAuthManager.getToken.mockReturnValue("test-token");
      mockHFClient.validateRepository.mockResolvedValue(true);
    });

    it("should display correct success message with all details", async () => {
      mockHFClient.downloadFile.mockResolvedValue({
        success: true,
        localPath: "/current/dir/test.txt",
        fileSize: 1024,
      });

      await downloadCommand.execute("username/repo", "models/test.txt", {
        repoType: "model",
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("✅ Download successful!")
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("File: test.txt")
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Repository: username/repo")
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Type: model")
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Saved to:")
      );
    });
  });
});
