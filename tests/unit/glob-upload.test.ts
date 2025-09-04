/**
 * Unit tests for glob pattern functionality in Upload Command
 */

import { UploadCommand } from "../../src/commands/upload";
import { PatternResolver } from "../../src/utils/pattern-resolver";
import { authManager } from "../../src/auth/manager";
import { FileSystemUtils } from "../../src/utils/files";
import { HFClientWrapper } from "../../src/types";
import { Logger } from "../../src/utils/logger";

// Mock dependencies
jest.mock("../../src/auth/manager");
jest.mock("../../src/utils/files");
jest.mock("../../src/utils/pattern-resolver");
jest.mock("fs-extra");

// Mock console methods to avoid output during tests
const mockConsoleLog = jest.spyOn(console, "log").mockImplementation();
const mockConsoleError = jest.spyOn(console, "error").mockImplementation();

// Mock process.exit
const mockProcessExit = jest.spyOn(process, "exit").mockImplementation();

describe("Upload Command - Glob Pattern Tests", () => {
  let uploadCommand: UploadCommand;
  let mockHFClient: jest.Mocked<HFClientWrapper>;
  let mockAuthManager: jest.Mocked<typeof authManager>;
  let mockFileSystemUtils: jest.Mocked<typeof FileSystemUtils>;
  let mockPatternResolver: jest.Mocked<typeof PatternResolver>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock HF client
    mockHFClient = {
      uploadFile: jest.fn(),
      uploadFiles: jest.fn(),
      downloadFile: jest.fn(),
      validateRepository: jest.fn(),
    };

    // Setup auth manager mock
    mockAuthManager = authManager as jest.Mocked<typeof authManager>;
    mockAuthManager.validateAuthentication = jest
      .fn()
      .mockResolvedValue("test-token");
    mockAuthManager.setToken = jest.fn();

    // Setup file system utils mock
    mockFileSystemUtils = FileSystemUtils as jest.Mocked<
      typeof FileSystemUtils
    >;
    mockFileSystemUtils.resolvePath = jest.fn();
    mockFileSystemUtils.validateFilePath = jest
      .fn()
      .mockResolvedValue({ valid: true });
    mockFileSystemUtils.getFileName = jest.fn().mockReturnValue("file.txt");
    mockFileSystemUtils.getHumanReadableFileSize = jest
      .fn()
      .mockResolvedValue("1.5 MB");
    mockFileSystemUtils.formatBytes = jest.fn().mockReturnValue("1.5 MB");

    // Setup pattern resolver mock
    mockPatternResolver = PatternResolver as jest.Mocked<
      typeof PatternResolver
    >;
    mockPatternResolver.isValidPattern = jest.fn().mockReturnValue(true);
    mockPatternResolver.resolvePattern = jest.fn();
    mockPatternResolver.getSummary = jest.fn().mockReturnValue("1 file (1 MB)");

    // Setup default mocks
    mockHFClient.validateRepository.mockResolvedValue(true);

    // Create upload command with mocked client
    uploadCommand = new UploadCommand(mockHFClient);
  });

  afterEach(() => {
    Logger.setToDefault();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  describe("Single File Patterns", () => {
    it("should handle single file upload with exact path", async () => {
      // Mock pattern resolution to return single file
      mockPatternResolver.resolvePattern.mockResolvedValue({
        totalFiles: 1,
        totalSize: 1572864,
        files: [
          {
            path: "/absolute/path/to/test.txt",
            size: 1572864,
            fileName: "test.txt",
          },
        ],
      });

      mockHFClient.uploadFile.mockResolvedValue({
        success: true,
        fileUrl: "https://huggingface.co/test/repo/blob/main/test.txt",
        commitSha: "abc123",
      });

      await uploadCommand.execute("test/repo", "test.txt", {
        token: "test-token",
      });

      expect(mockPatternResolver.resolvePattern).toHaveBeenCalledWith(
        "test.txt",
        {
          cwd: process.cwd(),
          maxFiles: 10000,
        }
      );
      expect(mockHFClient.uploadFile).toHaveBeenCalled();
      expect(mockHFClient.uploadFiles).not.toHaveBeenCalled();
    });

    it("should handle glob pattern matching single file", async () => {
      // Mock pattern resolution to return single file from glob
      mockPatternResolver.resolvePattern.mockResolvedValue({
        totalFiles: 1,
        totalSize: 2097152,
        files: [
          {
            path: "/absolute/path/to/model.bin",
            size: 2097152,
            fileName: "model.bin",
          },
        ],
      });

      mockHFClient.uploadFile.mockResolvedValue({
        success: true,
        fileUrl: "https://huggingface.co/test/repo/blob/main/model.bin",
        commitSha: "def456",
      });

      await uploadCommand.execute("test/repo", "*.bin", {
        token: "test-token",
      });

      expect(mockPatternResolver.resolvePattern).toHaveBeenCalledWith("*.bin", {
        cwd: process.cwd(),
        maxFiles: 10000,
      });
      expect(mockHFClient.uploadFile).toHaveBeenCalled();
      expect(mockHFClient.uploadFiles).not.toHaveBeenCalled();
    });
  });

  describe("Multiple File Patterns", () => {
    it("should handle multiple files using uploadFiles", async () => {
      const multipleFiles = [
        { path: "/path/to/file1.txt", size: 1024, fileName: "file1.txt" },
        { path: "/path/to/file2.txt", size: 2048, fileName: "file2.txt" },
        { path: "/path/to/file3.txt", size: 4096, fileName: "file3.txt" },
      ];

      mockPatternResolver.resolvePattern.mockResolvedValue({
        totalFiles: 3,
        totalSize: 7168,
        files: multipleFiles,
      });

      mockHFClient.uploadFiles.mockResolvedValue({
        success: true,
        filesUploaded: 3,
        totalFiles: 3,
        commitSha: "ghi789",
      });

      await uploadCommand.execute("test/repo", "*.txt", {
        token: "test-token",
        message: "Upload text files",
      });

      expect(mockPatternResolver.resolvePattern).toHaveBeenCalledWith("*.txt", {
        cwd: process.cwd(),
        maxFiles: 10000,
      });
      expect(mockHFClient.uploadFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          repoId: "test/repo",
          filePaths: [
            "/path/to/file1.txt",
            "/path/to/file2.txt",
            "/path/to/file3.txt",
          ],
          message: "Upload text files",
          repoType: "model",
          token: "test-token",
        })
      );
      expect(mockHFClient.uploadFile).not.toHaveBeenCalled();
    });

    it("should handle large number of files with batching", async () => {
      // Create 2500 files to test batching (exceeds 1000 limit per batch)
      const manyFiles = Array.from({ length: 2500 }, (_, i) => ({
        path: `/path/to/file${i}.txt`,
        size: 1024,
        fileName: `file${i}.txt`,
      }));

      mockPatternResolver.resolvePattern.mockResolvedValue({
        totalFiles: 2500,
        totalSize: 2500 * 1024,
        files: manyFiles,
      });

      mockHFClient.uploadFiles.mockResolvedValue({
        success: true,
        filesUploaded: 2500,
        totalFiles: 2500,
        commitSha: "batch123",
      });

      await uploadCommand.execute("test/repo", "files/*.txt", {
        token: "test-token",
      });

      expect(mockPatternResolver.resolvePattern).toHaveBeenCalledWith(
        "files/*.txt",
        {
          cwd: process.cwd(),
          maxFiles: 10000,
        }
      );
      expect(mockHFClient.uploadFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          repoId: "test/repo",
          filePaths: expect.arrayContaining([
            "/path/to/file0.txt",
            "/path/to/file2499.txt",
          ]),
        })
      );

      // Verify that all 2500 files are included
      const call = (mockHFClient.uploadFiles as jest.Mock).mock.calls[0][0];
      expect(call.filePaths).toHaveLength(2500);
    });
  });

  describe("Pattern Validation", () => {
    it("should reject unsafe patterns", async () => {
      mockPatternResolver.isValidPattern.mockReturnValue(false);

      let error: any = null;
      try {
        await uploadCommand.execute("test/repo", "/etc/**/*", {
          token: "test-token",
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("Unsafe file pattern");
      expect(mockPatternResolver.isValidPattern).toHaveBeenCalledWith(
        "/etc/**/*"
      );
      expect(mockPatternResolver.resolvePattern).not.toHaveBeenCalled();
    });

    it("should handle empty pattern", async () => {
      mockPatternResolver.isValidPattern.mockReturnValue(false);

      let error: any = null;
      try {
        await uploadCommand.execute("test/repo", "", {
          token: "test-token",
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("Unsafe file pattern");
      expect(mockPatternResolver.isValidPattern).toHaveBeenCalledWith("");
    });

    it("should handle pattern resolution failure", async () => {
      mockPatternResolver.resolvePattern.mockRejectedValue(
        new Error(
          "Pattern matched 15000 files, which exceeds the maximum limit of 10000"
        )
      );

      let error: any = null;
      try {
        await uploadCommand.execute("test/repo", "**/*", {
          token: "test-token",
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain(
        "Pattern matched 15000 files, which exceeds the maximum limit of 10000"
      );
    });

    it("should handle no files matched", async () => {
      mockPatternResolver.resolvePattern.mockResolvedValue({
        totalFiles: 0,
        totalSize: 0,
        files: [],
      });

      let error: any = null;
      try {
        await uploadCommand.execute("test/repo", "nonexistent/*.xyz", {
          token: "test-token",
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("No files matched the pattern");
      expect(error.message).toContain("nonexistent/*.xyz");
    });
  });

  describe("Multi-upload Error Handling", () => {
    it("should handle partial upload failures", async () => {
      const multipleFiles = [
        { path: "/path/to/file1.txt", size: 1024, fileName: "file1.txt" },
        { path: "/path/to/file2.txt", size: 2048, fileName: "file2.txt" },
        { path: "/path/to/file3.txt", size: 4096, fileName: "file3.txt" },
      ];

      mockPatternResolver.resolvePattern.mockResolvedValue({
        totalFiles: 3,
        totalSize: 7168,
        files: multipleFiles,
      });

      mockHFClient.uploadFiles.mockResolvedValue({
        success: true,
        filesUploaded: 2,
        totalFiles: 3,
        commitSha: "partial123",
        failedFiles: ["/path/to/file2.txt"],
      });

      await uploadCommand.execute("test/repo", "*.txt", {
        token: "test-token",
      });

      // Should succeed even with partial failures
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it("should handle complete upload failure", async () => {
      const multipleFiles = [
        { path: "/path/to/file1.txt", size: 1024, fileName: "file1.txt" },
        { path: "/path/to/file2.txt", size: 2048, fileName: "file2.txt" },
      ];

      mockPatternResolver.resolvePattern.mockResolvedValue({
        totalFiles: 2,
        totalSize: 3072,
        files: multipleFiles,
      });

      mockHFClient.uploadFiles.mockResolvedValue({
        success: false,
        filesUploaded: 0,
        totalFiles: 2,
        error: "Network error",
      });

      let error: any = null;
      try {
        await uploadCommand.execute("test/repo", "*.txt", {
          token: "test-token",
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("Network error");
    });
  });

  describe("Pattern Examples", () => {
    const testCases = [
      { pattern: "*.txt", description: "all text files" },
      {
        pattern: "models/*.bin",
        description: "binary files in models directory",
      },
      {
        pattern: "data/**/*.json",
        description: "JSON files in data directory recursively",
      },
      { pattern: "file.txt", description: "single specific file" },
      { pattern: "*.{txt,md}", description: "files with multiple extensions" },
    ];

    testCases.forEach(({ pattern, description }) => {
      it(`should handle pattern "${pattern}" (${description})`, async () => {
        mockPatternResolver.resolvePattern.mockResolvedValue({
          totalFiles: 1,
          totalSize: 1024,
          files: [
            {
              path: "/resolved/file.ext",
              size: 1024,
              fileName: "file.ext",
            },
          ],
        });

        mockHFClient.uploadFile.mockResolvedValue({
          success: true,
          fileUrl: "https://example.com/file",
          commitSha: "test123",
        });

        await uploadCommand.execute("test/repo", pattern, {
          token: "test-token",
        });

        expect(mockPatternResolver.resolvePattern).toHaveBeenCalledWith(
          pattern,
          {
            cwd: process.cwd(),
            maxFiles: 10000,
          }
        );
      });
    });
  });
});
