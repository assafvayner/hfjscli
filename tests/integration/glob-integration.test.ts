/**
 * Integration tests for glob pattern functionality
 * These tests create actual files and test real pattern matching
 */

import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { PatternResolver } from "../../src/utils/pattern-resolver";
import { UploadCommand } from "../../src/commands/upload";
import { HFClientWrapper } from "../../src/types";
import { authManager } from "../../src/auth/manager";

// Mock the auth manager and HF client for integration tests
jest.mock("../../src/auth/manager");

describe("Glob Integration Tests", () => {
  let testDir: string;
  let mockHFClient: HFClientWrapper;
  let mockAuthManager: jest.Mocked<typeof authManager>;

  beforeAll(async () => {
    // Create a temporary directory for test files
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "hfjscli-glob-test-"));
  });

  afterAll(async () => {
    // Clean up the test directory
    await fs.remove(testDir);
  });

  beforeEach(async () => {
    // Setup auth manager mock
    mockAuthManager = authManager as jest.Mocked<typeof authManager>;
    mockAuthManager.validateAuthentication = jest
      .fn()
      .mockResolvedValue("test-token");
    mockAuthManager.setToken = jest.fn();

    // Create test file structure
    await createTestFiles();

    // Create mock HF client
    mockHFClient = {
      uploadFile: jest.fn().mockResolvedValue({
        success: true,
        fileUrl: "https://huggingface.co/test/repo/blob/main/file.txt",
        commitSha: "abc123",
      }),
      uploadFiles: jest.fn().mockResolvedValue({
        success: true,
        filesUploaded: 5,
        totalFiles: 5,
        commitSha: "def456",
      }),
      downloadFile: jest.fn(),
      validateRepository: jest.fn().mockResolvedValue(true),
    };
  });

  afterEach(async () => {
    // Clean up test files after each test
    await fs.emptyDir(testDir);
  });

  async function createTestFiles() {
    // Create various test files with different extensions and in different directories
    const filesToCreate = [
      "test1.txt",
      "test2.txt",
      "data.json",
      "config.yaml",
      "models/model1.bin",
      "models/model2.bin",
      "models/config.json",
      "docs/readme.md",
      "docs/guide.md",
      "scripts/build.sh",
      "scripts/deploy.py",
    ];

    for (const file of filesToCreate) {
      const fullPath = path.join(testDir, file);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, `Content of ${file}`);
    }
  }

  describe("PatternResolver", () => {
    it("should resolve single file pattern", async () => {
      const result = await PatternResolver.resolvePattern("test1.txt", {
        cwd: testDir,
      });

      expect(result.totalFiles).toBe(1);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].fileName).toBe("test1.txt");
      expect(result.files[0].size).toBeGreaterThan(0);
    });

    it("should resolve wildcard patterns", async () => {
      const result = await PatternResolver.resolvePattern("*.txt", {
        cwd: testDir,
      });

      expect(result.totalFiles).toBe(2);
      expect(result.files).toHaveLength(2);
      expect(result.files.map((f) => f.fileName)).toContain("test1.txt");
      expect(result.files.map((f) => f.fileName)).toContain("test2.txt");
    });

    it("should resolve directory patterns", async () => {
      const result = await PatternResolver.resolvePattern("models/*", {
        cwd: testDir,
      });

      expect(result.totalFiles).toBe(3);
      expect(result.files).toHaveLength(3);
      const relativePaths = result.files.map((f) => path.basename(f.fileName));
      expect(relativePaths).toContain("model1.bin");
      expect(relativePaths).toContain("model2.bin");
      expect(relativePaths).toContain("config.json");
    });

    it("should resolve recursive patterns", async () => {
      const result = await PatternResolver.resolvePattern("**/*.json", {
        cwd: testDir,
      });

      expect(result.totalFiles).toBe(2);
      expect(result.files).toHaveLength(2);
      const relativePaths = result.files.map((f) => f.fileName);
      expect(relativePaths).toContain("data.json");
      expect(
        result.files.some(
          (p) => p.path.includes("models") && p.path.includes("config.json")
        )
      ).toBe(true);
    });

    it("should resolve extension-specific patterns", async () => {
      const result = await PatternResolver.resolvePattern("**/*.md", {
        cwd: testDir,
      });

      expect(result.totalFiles).toBe(2);
      expect(result.files).toHaveLength(2);
      expect(result.files.every((f) => f.fileName.endsWith(".md"))).toBe(true);
    });

    it("should handle patterns with no matches", async () => {
      const result = await PatternResolver.resolvePattern("*.nonexistent", {
        cwd: testDir,
      });

      expect(result.totalFiles).toBe(0);
      expect(result.files).toHaveLength(0);
    });

    it("should calculate file sizes correctly", async () => {
      const result = await PatternResolver.resolvePattern("test1.txt", {
        cwd: testDir,
      });

      expect(result.totalFiles).toBe(1);
      expect(result.totalSize).toBeGreaterThan(0);
      expect(result.files[0].size).toBe(result.totalSize);
    });

    it("should provide human-readable summary", async () => {
      const result = await PatternResolver.resolvePattern("*.txt", {
        cwd: testDir,
      });
      const summary = PatternResolver.getSummary(result);

      expect(summary).toContain("2 files");
      expect(summary).toMatch(/\d+ Bytes/);
    });
  });

  describe("Upload Command Integration", () => {
    it("should upload single file via pattern", async () => {
      const uploadCommand = new UploadCommand(mockHFClient);
      process.chdir(testDir); // Change to test directory

      try {
        await uploadCommand.execute("test/repo", "test1.txt", {
          token: "test-token",
        });

        expect(mockHFClient.uploadFile).toHaveBeenCalled();
        expect(mockHFClient.uploadFiles).not.toHaveBeenCalled();
      } finally {
        process.chdir(__dirname); // Change back to original directory
      }
    });

    it("should upload multiple files via pattern", async () => {
      const uploadCommand = new UploadCommand(mockHFClient);
      process.chdir(testDir);

      try {
        await uploadCommand.execute("test/repo", "*.txt", {
          token: "test-token",
        });

        expect(mockHFClient.uploadFiles).toHaveBeenCalled();
        expect(mockHFClient.uploadFile).not.toHaveBeenCalled();

        const call = (mockHFClient.uploadFiles as jest.Mock).mock.calls[0][0];
        expect(call.filePaths).toHaveLength(2);
        expect(
          call.filePaths.some((path: string) => path.includes("test1.txt"))
        ).toBe(true);
        expect(
          call.filePaths.some((path: string) => path.includes("test2.txt"))
        ).toBe(true);
      } finally {
        process.chdir(__dirname);
      }
    });

    it("should handle nested directory patterns", async () => {
      const uploadCommand = new UploadCommand(mockHFClient);
      process.chdir(testDir);

      try {
        await uploadCommand.execute("test/repo", "models/*.bin", {
          token: "test-token",
        });

        expect(mockHFClient.uploadFiles).toHaveBeenCalled();

        const call = (mockHFClient.uploadFiles as jest.Mock).mock.calls[0][0];
        expect(call.filePaths).toHaveLength(2);
        expect(
          call.filePaths.every(
            (path: string) => path.includes("models") && path.endsWith(".bin")
          )
        ).toBe(true);
      } finally {
        process.chdir(__dirname);
      }
    });

    it("should fail gracefully when no files match pattern", async () => {
      const uploadCommand = new UploadCommand(mockHFClient);
      process.chdir(testDir);

      let error: any = null;
      try {
        await uploadCommand.execute("test/repo", "*.nonexistent", {
          token: "test-token",
        });
      } catch (err) {
        error = err;
      } finally {
        process.chdir(__dirname);
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("No files matched the pattern");
    });
  });

  describe("Pattern Safety", () => {
    it("should reject dangerous patterns", () => {
      expect(PatternResolver.isValidPattern("/etc/**/*")).toBe(false);
      expect(PatternResolver.isValidPattern("/usr/**/*")).toBe(false);
      expect(PatternResolver.isValidPattern("/**/*")).toBe(false);
    });

    it("should accept safe patterns", () => {
      expect(PatternResolver.isValidPattern("*.txt")).toBe(true);
      expect(PatternResolver.isValidPattern("data/*.json")).toBe(true);
      expect(PatternResolver.isValidPattern("models/**/*.bin")).toBe(true);
      expect(PatternResolver.isValidPattern("./files/*.txt")).toBe(true);
    });

    it("should handle edge cases", () => {
      expect(PatternResolver.isValidPattern("")).toBe(false);
      expect(PatternResolver.isValidPattern("   ")).toBe(false);
    });
  });
});
