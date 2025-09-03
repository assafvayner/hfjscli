/**
 * Unit tests for Upload Command Handler
 */

import { UploadCommand } from "../../src/commands/upload";
import { authManager } from "../../src/auth/manager";
import { FileSystemUtils } from "../../src/utils/files";
import { HFClientWrapper, ErrorType } from "../../src/types";
import { Logger } from "../../src/utils/logger";

// Mock dependencies
jest.mock("../../src/auth/manager");
jest.mock("../../src/utils/files");
jest.mock("fs-extra");
jest.mock("ora", () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: "",
  }));
});

// Mock console methods to avoid output during tests
const mockConsoleLog = jest.spyOn(console, "log").mockImplementation();
const mockConsoleError = jest.spyOn(console, "error").mockImplementation();

// Mock process.exit
const mockProcessExit = jest.spyOn(process, "exit").mockImplementation();

describe("UploadCommand", () => {
  let uploadCommand: UploadCommand;
  let mockHFClient: jest.Mocked<HFClientWrapper>;
  let mockAuthManager: jest.Mocked<typeof authManager>;
  let mockFileSystemUtils: jest.Mocked<typeof FileSystemUtils>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock HF client
    mockHFClient = {
      uploadFile: jest.fn(),
      downloadFile: jest.fn(),
      validateRepository: jest.fn(),
    };

    // Setup auth manager mock
    mockAuthManager = authManager as jest.Mocked<typeof authManager>;
    mockAuthManager.validateAuthentication = jest.fn();
    mockAuthManager.setToken = jest.fn();

    // Setup file system utils mock
    mockFileSystemUtils = FileSystemUtils as jest.Mocked<
      typeof FileSystemUtils
    >;
    mockFileSystemUtils.resolvePath = jest.fn();
    mockFileSystemUtils.validateFilePath = jest.fn();
    mockFileSystemUtils.getFileName = jest.fn();
    mockFileSystemUtils.getHumanReadableFileSize = jest.fn();

    // Create upload command with mocked client
    uploadCommand = new UploadCommand(mockHFClient);
  });

  afterEach(() => {
    Logger.setToDefault();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  describe("execute", () => {
    const validRepoId = "username/repo-name";
    const validFilePath = "/path/to/file.txt";
    const validOptions = {
      token: "test-token",
      message: "Test upload",
      repoType: "model",
      verbose: false,
    };

    beforeEach(() => {
      // Setup default successful mocks
      mockFileSystemUtils.resolvePath.mockReturnValue(
        "/resolved/path/to/file.txt"
      );
      mockFileSystemUtils.validateFilePath.mockResolvedValue({ valid: true });
      mockFileSystemUtils.getFileName.mockReturnValue("file.txt");
      mockFileSystemUtils.getHumanReadableFileSize.mockResolvedValue("1.5 MB");
      mockAuthManager.validateAuthentication.mockResolvedValue("test-token");
      mockHFClient.validateRepository.mockResolvedValue(true);
      mockHFClient.uploadFile.mockResolvedValue({
        success: true,
        fileUrl: "https://huggingface.co/username/repo-name/blob/main/file.txt",
        commitSha: "abc123",
      });
    });

    it("should successfully upload a file with valid inputs", async () => {
      await uploadCommand.execute(validRepoId, validFilePath, validOptions);

      expect(mockAuthManager.setToken).toHaveBeenCalledWith("test-token");
      expect(mockAuthManager.validateAuthentication).toHaveBeenCalledWith(true);
      expect(mockHFClient.validateRepository).toHaveBeenCalledWith(
        validRepoId,
        "model"
      );
      expect(mockHFClient.uploadFile).toHaveBeenCalledWith({
        repoId: validRepoId,
        filePath: "/resolved/path/to/file.txt",
        token: "test-token",
        message: "Test upload",
        repoType: "model",
        verbose: false,
      });
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it("should use default commit message when not provided", async () => {
      const optionsWithoutMessage = {
        token: validOptions.token,
        repoType: validOptions.repoType,
        verbose: validOptions.verbose,
      };

      await uploadCommand.execute(
        validRepoId,
        validFilePath,
        optionsWithoutMessage
      );

      expect(mockHFClient.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Upload file.txt",
        })
      );
    });

    it("should default to model repository type when not specified", async () => {
      const optionsWithoutRepoType = {
        token: validOptions.token,
        message: validOptions.message,
        verbose: validOptions.verbose,
      };

      await uploadCommand.execute(
        validRepoId,
        validFilePath,
        optionsWithoutRepoType
      );

      expect(mockHFClient.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          repoType: "model",
        })
      );
    });

    it("should handle dataset repository type", async () => {
      const datasetOptions = { ...validOptions, repoType: "dataset" };

      await uploadCommand.execute(validRepoId, validFilePath, datasetOptions);

      expect(mockHFClient.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          repoType: "dataset",
        })
      );
    });

    it("should handle space repository type", async () => {
      const spaceOptions = { ...validOptions, repoType: "space" };

      await uploadCommand.execute(validRepoId, validFilePath, spaceOptions);

      expect(mockHFClient.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          repoType: "space",
        })
      );
    });
  });

  describe("validation errors", () => {
    it("should fail with empty repository ID", async () => {
      let err: any = null;
      try {
        await uploadCommand.execute("", "/path/to/file.txt", {});
      } catch (error) {
        err = error;
      }

      expect(err).not.toBeNull();
      expect(err.message).toContain("Repository ID is required");
    });

    it("should fail with invalid repository ID format", async () => {
      let err: any = null;
      try {
        await uploadCommand.execute("invalid-repo-id", "/path/to/file.txt", {});
      } catch (error) {
        err = error;
      }

      expect(err).not.toBeNull();
      expect(err.message).toContain("Invalid repository ID format");
    });

    it("should fail with empty file path", async () => {
      let err: any = null;
      try {
        await uploadCommand.execute("username/repo", "", {});
      } catch (error) {
        err = error;
      }

      expect(err).not.toBeNull();
      expect(err.message).toContain("File path is required");
    });

    it("should fail when file does not exist", async () => {
      mockFileSystemUtils.resolvePath.mockReturnValue(
        "/resolved/path/to/file.txt"
      );
      mockFileSystemUtils.validateFilePath.mockResolvedValue({
        valid: false,
        error: "File does not exist: /resolved/path/to/file.txt",
      });

      let err: any = null;
      try {
        await uploadCommand.execute("username/repo", "/path/to/file.txt", {});
      } catch (error) {
        err = error;
      }

      expect(err).not.toBeNull();
      expect(err.message).toContain(
        "File does not exist: /resolved/path/to/file.txt"
      );
    });

    it("should fail with invalid repository type", async () => {
      mockFileSystemUtils.resolvePath.mockReturnValue(
        "/resolved/path/to/file.txt"
      );
      mockFileSystemUtils.validateFilePath.mockResolvedValue({ valid: true });

      let err: any = null;
      try {
        await uploadCommand.execute("username/repo", "/path/to/file.txt", {
          repoType: "invalid-type",
        });
      } catch (error) {
        err = error;
      }

      expect(err).not.toBeNull();
      expect(err.message).toContain("Invalid repository type: invalid-type");
    });
  });

  describe("authentication errors", () => {
    beforeEach(() => {
      mockFileSystemUtils.resolvePath.mockReturnValue(
        "/resolved/path/to/file.txt"
      );
      mockFileSystemUtils.validateFilePath.mockResolvedValue({ valid: true });
    });

    it("should fail when no authentication token is provided", async () => {
      mockAuthManager.validateAuthentication.mockRejectedValue({
        type: ErrorType.AUTHENTICATION_ERROR,
        message: "No authentication token found",
        suggestions: ["Set HF_TOKEN environment variable"],
      });

      let err: any = null;
      try {
        await uploadCommand.execute("username/repo", "/path/to/file.txt", {});
      } catch (error) {
        err = error;
      }

      expect(err).not.toBeNull();
      expect(err.message).toContain("No authentication token found");
    });

    it("should fail when authentication token is invalid", async () => {
      mockAuthManager.validateAuthentication.mockRejectedValue({
        type: ErrorType.AUTHENTICATION_ERROR,
        message: "Invalid authentication token",
        suggestions: ["Check if your token is correct"],
      });

      let err: any = null;
      try {
        await uploadCommand.execute("username/repo", "/path/to/file.txt", {
          token: "invalid-token",
        });
      } catch (error) {
        err = error;
      }

      expect(err).not.toBeNull();
      expect(err.message).toContain("Invalid authentication token");
    });
  });

  describe("repository validation errors", () => {
    beforeEach(() => {
      mockFileSystemUtils.resolvePath.mockReturnValue(
        "/resolved/path/to/file.txt"
      );
      mockFileSystemUtils.validateFilePath.mockResolvedValue({ valid: true });
      mockFileSystemUtils.getFileName.mockReturnValue("file.txt");
      mockFileSystemUtils.getHumanReadableFileSize.mockResolvedValue("1.5 MB");
      mockAuthManager.validateAuthentication.mockResolvedValue("test-token");
    });

    it("should fail when repository does not exist or is not accessible", async () => {
      mockHFClient.validateRepository.mockResolvedValue(false);

      let err: any = null;
      try {
        await uploadCommand.execute(
          "username/nonexistent-repo",
          "/path/to/file.txt",
          {
            token: "test-token",
          }
        );
      } catch (error) {
        err = error;
      }

      expect(err).not.toBeNull();
      expect(err.message).toContain("Repository not found or not accessible");
    });
  });

  describe("upload errors", () => {
    beforeEach(() => {
      mockFileSystemUtils.resolvePath.mockReturnValue(
        "/resolved/path/to/file.txt"
      );
      mockFileSystemUtils.validateFilePath.mockResolvedValue({ valid: true });
      mockFileSystemUtils.getFileName.mockReturnValue("file.txt");
      mockFileSystemUtils.getHumanReadableFileSize.mockResolvedValue("1.5 MB");
      mockAuthManager.validateAuthentication.mockResolvedValue("test-token");
      mockHFClient.validateRepository.mockResolvedValue(true);
    });

    it("should fail when upload operation fails", async () => {
      mockHFClient.uploadFile.mockResolvedValue({
        success: false,
        error: "Network error occurred",
      });

      let err: any = null;
      try {
        await uploadCommand.execute("username/repo", "/path/to/file.txt", {
          token: "test-token",
        });
      } catch (error) {
        err = error;
      }

      expect(err).not.toBeNull();
      expect(err.message).toContain("Network error occurred");
    });

    it("should handle upload failure without specific error message", async () => {
      mockHFClient.uploadFile.mockResolvedValue({
        success: false,
      });

      let err: any = null;
      try {
        await uploadCommand.execute("username/repo", "/path/to/file.txt", {
          token: "test-token",
        });
      } catch (error) {
        err = error;
      }

      expect(err).not.toBeNull();
      expect(err.message).toContain("Upload failed");
    });
  });

  describe("verbose mode", () => {
    beforeEach(() => {
      mockFileSystemUtils.resolvePath.mockReturnValue(
        "/resolved/path/to/file.txt"
      );
      mockFileSystemUtils.validateFilePath.mockResolvedValue({ valid: true });
      mockFileSystemUtils.getFileName.mockReturnValue("file.txt");
      mockFileSystemUtils.getHumanReadableFileSize.mockResolvedValue("1.5 MB");
      mockAuthManager.validateAuthentication.mockResolvedValue("test-token");
      mockHFClient.validateRepository.mockResolvedValue(true);
      mockHFClient.uploadFile.mockResolvedValue({
        success: true,
        fileUrl: "https://huggingface.co/username/repo/blob/main/file.txt",
        commitSha: "abc123",
      });
    });

    it("should display verbose logs when verbose mode is enabled", async () => {
      await uploadCommand.execute("username/repo", "/path/to/file.txt", {
        token: "test-token",
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("[VERBOSE]")
      );
    });

    it("should display commit SHA in success message when verbose mode is enabled", async () => {
      await uploadCommand.execute("username/repo", "/path/to/file.txt", {
        token: "test-token",
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Commit: abc123")
      );
    });
  });

  describe("repository ID validation", () => {
    const testCases = [
      { repoId: "user/repo", valid: true },
      { repoId: "user123/repo-name", valid: true },
      { repoId: "user_name/repo.name", valid: true },
      { repoId: "user-name/repo_name", valid: true },
      { repoId: "a/b", valid: true },
      { repoId: "user/repo-name-123", valid: true },
      { repoId: "user123/repo.name.ext", valid: true },
      { repoId: "invalid", valid: false },
      { repoId: "/invalid", valid: false },
      { repoId: "user/", valid: false },
      { repoId: "/repo", valid: false },
      { repoId: "user//repo", valid: false },
      { repoId: "-user/repo", valid: false },
      { repoId: "user/-repo", valid: false },
      { repoId: "user/repo-", valid: false },
      { repoId: "user-/repo", valid: false },
    ];

    testCases.forEach(({ repoId, valid }) => {
      it(`should ${
        valid ? "accept" : "reject"
      } repository ID: ${repoId}`, async () => {
        if (valid) {
          mockFileSystemUtils.resolvePath.mockReturnValue(
            "/resolved/path/to/file.txt"
          );
          mockFileSystemUtils.validateFilePath.mockResolvedValue({
            valid: true,
          });
          mockFileSystemUtils.getFileName.mockReturnValue("file.txt");
          mockFileSystemUtils.getHumanReadableFileSize.mockResolvedValue(
            "1.5 MB"
          );
          mockAuthManager.validateAuthentication.mockResolvedValue(
            "test-token"
          );
          mockHFClient.validateRepository.mockResolvedValue(true);
          mockHFClient.uploadFile.mockResolvedValue({ success: true });

          await uploadCommand.execute(repoId, "/path/to/file.txt", {
            token: "test-token",
          });
          expect(mockProcessExit).not.toHaveBeenCalled();
        } else {
          let err: any = null;
          try {
            await uploadCommand.execute(repoId, "/path/to/file.txt", {});
          } catch (error) {
            err = error;
          }
          expect(err).not.toBeNull();
          expect(err.message).toContain("Invalid repository ID format");
        }
      });
    });
  });
});
