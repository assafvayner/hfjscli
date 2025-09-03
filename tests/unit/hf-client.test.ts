/**
 * Unit tests for HFClientWrapper
 */

import { HFClient, createHFClient } from "../../src/client/hf-client";
import { RepoType } from "../../src/types/index";
import * as path from "path";

// Mock the @huggingface/hub module
jest.mock("@huggingface/hub", () => ({
  uploadFile: jest.fn(),
  downloadFile: jest.fn(),
  listFiles: jest.fn(),
}));

// Mock fs-extra
jest.mock("fs-extra", () => ({
  pathExists: jest.fn(),
  readFile: jest.fn(),
  ensureDir: jest.fn(),
  writeFile: jest.fn(),
  createWriteStream: jest.fn(),
  unlink: jest.fn(),
  stat: jest.fn(),
  createReadStream: jest.fn(),
}));

// Mock stream/promises
jest.mock("stream/promises", () => ({
  pipeline: jest.fn(),
}));

// Mock stream
jest.mock("stream", () => ({
  Readable: {
    fromWeb: jest.fn(),
  },
}));

// Import mocked modules after mocking
import { uploadFile, downloadFile, listFiles } from "@huggingface/hub";
import * as fs from "fs-extra";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const mockUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;
const mockDownloadFile = downloadFile as jest.MockedFunction<
  typeof downloadFile
>;
const mockListFiles = listFiles as jest.MockedFunction<typeof listFiles>;
const mockPathExists = fs.pathExists as jest.MockedFunction<
  typeof fs.pathExists
>;
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockEnsureDir = fs.ensureDir as jest.MockedFunction<typeof fs.ensureDir>;
const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockCreateWriteStream = fs.createWriteStream as jest.MockedFunction<
  typeof fs.createWriteStream
>;
const mockUnlink = fs.unlink as jest.MockedFunction<typeof fs.unlink>;
const mockStat = fs.stat as jest.MockedFunction<typeof fs.stat>;
const mockCreateReadStream = fs.createReadStream as jest.MockedFunction<
  typeof fs.createReadStream
>;
const mockPipeline = pipeline as jest.MockedFunction<typeof pipeline>;
const mockReadableFromWeb = Readable.fromWeb as jest.MockedFunction<
  typeof Readable.fromWeb
>;

describe("HFClient", () => {
  let client: HFClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new HFClient("test-token");
  });

  describe("constructor", () => {
    it("should create instance with token", () => {
      const clientWithToken = new HFClient("test-token");
      expect(clientWithToken).toBeInstanceOf(HFClient);
    });

    it("should create instance without token", () => {
      const clientWithoutToken = new HFClient();
      expect(clientWithoutToken).toBeInstanceOf(HFClient);
    });
  });

  describe("uploadFile", () => {
    const mockUploadOptions = {
      repoId: "test-user/test-repo",
      filePath: "/path/to/test-file.txt",
      repoType: "model" as RepoType,
      token: "test-token",
      verbose: false,
    };

    const mockReadStream: any = {
      on: jest.fn((event: string, callback: any): any => {
        if (event === "data") {
          // Simulate file data chunks
          callback(Buffer.from("test "));
          callback(Buffer.from("content"));
        } else if (event === "end") {
          callback();
        }
        return mockReadStream;
      }),
    };

    beforeEach(() => {
      (mockPathExists as any).mockResolvedValue(true);
      (mockReadFile as any).mockResolvedValue(Buffer.from("test content"));
      (mockStat as any).mockResolvedValue({ size: 12 }); // Mock file size
      (mockCreateReadStream as any).mockReturnValue(mockReadStream);
      (mockUploadFile as any).mockResolvedValue({
        commit: { oid: "test-commit-sha" },
      });
    });

    it("should successfully upload a file", async () => {
      const result = await client.uploadFile(mockUploadOptions);

      expect(result.success).toBe(true);
      expect(result.fileUrl).toContain("test-user/test-repo");
      expect(result.commitSha).toBe("test-commit-sha");
      expect(mockPathExists).toHaveBeenCalledWith("/path/to/test-file.txt");
      expect(mockUploadFile).toHaveBeenCalled();
    });

    it("should handle file not found error", async () => {
      (mockPathExists as any).mockResolvedValue(false);

      const result = await client.uploadFile(mockUploadOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Local file not found");
    });

    it("should validate repository ID", async () => {
      const invalidOptions = { ...mockUploadOptions, repoId: "" };

      const result = await client.uploadFile(invalidOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Repository ID is required");
    });

    it("should validate file path", async () => {
      const invalidOptions = { ...mockUploadOptions, filePath: "" };

      const result = await client.uploadFile(invalidOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("File path is required");
    });

    it("should validate repository type", async () => {
      const invalidOptions = {
        ...mockUploadOptions,
        repoType: "invalid" as RepoType,
      };

      const result = await client.uploadFile(invalidOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid repository type");
    });

    it("should handle authentication errors", async () => {
      const authError = new Error("401 Unauthorized");
      (mockUploadFile as any).mockRejectedValue(authError);

      const result = await client.uploadFile(mockUploadOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Authentication failed");
    });

    it("should handle network errors", async () => {
      // Use client with no retries for faster test
      const clientNoRetry = new HFClient("test-token", {
        maxRetries: 0,
        baseDelay: 10,
        maxDelay: 100,
      });
      const networkError = new Error("Network error");
      (mockUploadFile as any).mockRejectedValue(networkError);

      const result = await clientNoRetry.uploadFile(mockUploadOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network or API error");
    });

    it("should use custom commit message", async () => {
      const optionsWithMessage = {
        ...mockUploadOptions,
        message: "Custom commit message",
      };

      await client.uploadFile(optionsWithMessage);

      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          commitTitle: "Custom commit message",
        })
      );
    });
  });

  describe("downloadFile", () => {
    const mockDownloadOptions = {
      repoId: "test-user/test-repo",
      filePath: "test-file.txt",
      repoType: "model" as RepoType,
      token: "test-token",
      verbose: false,
    };

    const mockResponse = {
      stream: jest.fn().mockReturnValue({
        getReader: jest.fn().mockReturnValue({
          read: jest
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new Uint8Array([1, 2, 3, 4, 5]),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new Uint8Array([6, 7, 8, 9, 10]),
            })
            .mockResolvedValue({ done: true, value: undefined }),
        }),
      }),
    };

    const mockWriteStream: any = {
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
    };

    const mockReadableStream: any = {
      on: jest.fn((event: string, callback: any): any => {
        if (event === "data") {
          // Simulate data chunks
          callback(Buffer.from([1, 2, 3, 4, 5]));
          callback(Buffer.from([6, 7, 8, 9, 10]));
        }
        return mockReadableStream;
      }),
      pipe: jest.fn(),
    };

    beforeEach(() => {
      (mockEnsureDir as any).mockResolvedValue(undefined);
      (mockWriteFile as any).mockResolvedValue(undefined);
      (mockDownloadFile as any).mockResolvedValue(mockResponse);
      (mockCreateWriteStream as any).mockReturnValue(mockWriteStream);
      (mockReadableFromWeb as any).mockReturnValue(mockReadableStream);
      (mockPipeline as any).mockResolvedValue(undefined);
      (mockUnlink as any).mockResolvedValue(undefined);
    });

    it("should successfully download a file", async () => {
      const result = await client.downloadFile(mockDownloadOptions);

      expect(result.success).toBe(true);
      expect(result.localPath).toContain("test-file.txt");
      expect(result.fileSize).toBe(10);
      expect(mockDownloadFile).toHaveBeenCalled();
      expect(mockPipeline).toHaveBeenCalled();
      expect(mockCreateWriteStream).toHaveBeenCalled();
    });

    it("should use custom local directory", async () => {
      const optionsWithLocalDir = {
        ...mockDownloadOptions,
        localDir: "/custom/path",
      };

      const result = await client.downloadFile(optionsWithLocalDir);

      expect(result.success).toBe(true);
      expect(result.localPath).toBe("/custom/path/test-file.txt");
    });

    it("should use current working directory by default", async () => {
      const originalCwd = process.cwd();

      const result = await client.downloadFile(mockDownloadOptions);

      expect(result.success).toBe(true);
      expect(result.localPath).toBe(path.join(originalCwd, "test-file.txt"));
    });

    it("should validate repository ID", async () => {
      const invalidOptions = { ...mockDownloadOptions, repoId: "" };

      const result = await client.downloadFile(invalidOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Repository ID is required");
    });

    it("should validate file path", async () => {
      const invalidOptions = { ...mockDownloadOptions, filePath: "" };

      const result = await client.downloadFile(invalidOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("File path is required");
    });

    it("should handle file not found errors", async () => {
      const notFoundError = new Error("404 Not Found");
      (mockDownloadFile as any).mockRejectedValue(notFoundError);

      const result = await client.downloadFile(mockDownloadOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Repository or file not found");
    });

    it("should handle rate limit errors", async () => {
      // Use client with no retries for faster test
      const clientNoRetry = new HFClient("test-token", {
        maxRetries: 0,
        baseDelay: 10,
        maxDelay: 100,
      });
      const rateLimitError = new Error("429 Too Many Requests");
      (mockDownloadFile as any).mockRejectedValue(rateLimitError);

      const result = await clientNoRetry.downloadFile(mockDownloadOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Rate limit exceeded");
    });
  });

  describe("validateRepository", () => {
    beforeEach(() => {
      // Mock the async iterator for listFiles
      const mockAsyncIterator = {
        next: jest
          .fn()
          .mockResolvedValue({ value: { path: "test.txt" }, done: false }),
        [Symbol.asyncIterator]: function () {
          return this;
        },
      };
      (mockListFiles as any).mockReturnValue(mockAsyncIterator);
    });

    it("should return true for valid repository", async () => {
      const isValid = await client.validateRepository(
        "test-user/test-repo",
        "model"
      );

      expect(isValid).toBe(true);
      expect(mockListFiles).toHaveBeenCalledWith({
        repo: { name: "test-user/test-repo", type: "model" },
        credentials: { accessToken: "test-token" },
      });
    });

    it("should return false for invalid repository", async () => {
      const mockAsyncIterator = {
        next: jest.fn().mockRejectedValue(new Error("404 Not Found")),
        [Symbol.asyncIterator]: function () {
          return this;
        },
      };
      (mockListFiles as any).mockReturnValue(mockAsyncIterator);

      const isValid = await client.validateRepository("invalid/repo", "model");

      expect(isValid).toBe(false);
    });

    it("should handle different repository types", async () => {
      await client.validateRepository("test-user/test-dataset", "dataset");

      expect(mockListFiles).toHaveBeenCalledWith({
        repo: {
          name: "test-user/test-dataset",
          type: "dataset",
        },
        credentials: { accessToken: "test-token" },
      });
    });
  });

  describe("retry logic", () => {
    const mockUploadOptions = {
      repoId: "test-user/test-repo",
      filePath: "/path/to/test-file.txt",
      repoType: "model" as RepoType,
      token: "test-token",
      verbose: false,
    };

    beforeEach(() => {
      (mockPathExists as any).mockResolvedValue(true);
      (mockReadFile as any).mockResolvedValue(Buffer.from("test content"));
    });

    it("should retry on network errors", async () => {
      // Create client with custom retry config for faster testing
      const clientWithRetry = new HFClient("test-token", {
        maxRetries: 2,
        baseDelay: 10,
        maxDelay: 100,
      });

      (mockUploadFile as any)
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({ commit: { oid: "test-commit-sha" } });

      const result = await clientWithRetry.uploadFile(mockUploadOptions);

      expect(result.success).toBe(true);
      expect(mockUploadFile).toHaveBeenCalledTimes(3);
    });

    it("should not retry on authentication errors", async () => {
      const clientWithRetry = new HFClient("test-token", {
        maxRetries: 2,
        baseDelay: 10,
        maxDelay: 100,
      });

      (mockUploadFile as any).mockRejectedValue(new Error("401 Unauthorized"));

      const result = await clientWithRetry.uploadFile(mockUploadOptions);

      expect(result.success).toBe(false);
      expect(mockUploadFile).toHaveBeenCalledTimes(1);
    });

    it("should not retry on validation errors", async () => {
      const clientWithRetry = new HFClient("test-token", {
        maxRetries: 2,
        baseDelay: 10,
        maxDelay: 100,
      });

      (mockUploadFile as any).mockRejectedValue(new Error("400 Bad Request"));

      const result = await clientWithRetry.uploadFile(mockUploadOptions);

      expect(result.success).toBe(false);
      expect(mockUploadFile).toHaveBeenCalledTimes(1);
    });

    it("should give up after max retries", async () => {
      const clientWithRetry = new HFClient("test-token", {
        maxRetries: 1,
        baseDelay: 10,
        maxDelay: 100,
      });

      (mockUploadFile as any).mockRejectedValue(new Error("Network error"));

      const result = await clientWithRetry.uploadFile(mockUploadOptions);

      expect(result.success).toBe(false);
      expect(mockUploadFile).toHaveBeenCalledTimes(2); // Initial attempt + 1 retry
    });
  });

  describe("createHFClient factory function", () => {
    it("should create HFClient instance with token", () => {
      const client = createHFClient("test-token");
      expect(client).toBeInstanceOf(HFClient);
    });

    it("should create HFClient instance without token", () => {
      const client = createHFClient();
      expect(client).toBeInstanceOf(HFClient);
    });
  });
});
