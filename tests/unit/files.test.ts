import * as fs from "fs";
import * as path from "path";
import { FileSystemUtils } from "../../src/utils/files";

describe("FileSystemUtils", () => {
  const tempDir = path.join(__dirname, "temp-test-files");
  const tempFile = path.join(tempDir, "test.txt");
  const nonExistentFile = path.join(tempDir, "nonexistent.txt");

  beforeEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(
      tempFile,
      "Test file content for file operations testing."
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("exists", () => {
    it("should return true for existing file", async () => {
      const result = await FileSystemUtils.exists(tempFile);
      expect(result).toBe(true);
    });

    it("should return false for non-existent file", async () => {
      const result = await FileSystemUtils.exists(nonExistentFile);
      expect(result).toBe(false);
    });
  });

  describe("isFile", () => {
    it("should return true for existing file", async () => {
      const result = await FileSystemUtils.isFile(tempFile);
      expect(result).toBe(true);
    });

    it("should return false for directory", async () => {
      const result = await FileSystemUtils.isFile(tempDir);
      expect(result).toBe(false);
    });
  });

  describe("validateFilePath", () => {
    it("should return valid for existing file", async () => {
      const result = await FileSystemUtils.validateFilePath(tempFile);
      expect(result.valid).toBe(true);
    });

    it("should return invalid for empty path", async () => {
      const result = await FileSystemUtils.validateFilePath("");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("File path cannot be empty");
    });

    it("should return invalid for non-existent file", async () => {
      const result = await FileSystemUtils.validateFilePath(nonExistentFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("File does not exist");
    });
  });

  describe("getFileSize", () => {
    it("should return file size for existing file", async () => {
      const result = await FileSystemUtils.getFileSize(tempFile);
      expect(result).toBeGreaterThan(0);
    });

    it("should throw error for non-existent file", async () => {
      await expect(
        FileSystemUtils.getFileSize(nonExistentFile)
      ).rejects.toThrow("Cannot get file size");
    });
  });

  describe("formatBytes", () => {
    it("should format bytes correctly", () => {
      expect(FileSystemUtils.formatBytes(0)).toBe("0 Bytes");
      expect(FileSystemUtils.formatBytes(500)).toBe("500 Bytes");
      expect(FileSystemUtils.formatBytes(1024)).toBe("1 KB");
      expect(FileSystemUtils.formatBytes(1048576)).toBe("1 MB");
    });
  });

  describe("checkPermissions", () => {
    it("should check permissions for existing file", async () => {
      const result = await FileSystemUtils.checkPermissions(tempFile);
      expect(result).toHaveProperty("readable");
      expect(result).toHaveProperty("writable");
      expect(result).toHaveProperty("executable");
    });
  });

  describe("ensureDirectory", () => {
    it("should create directory if it does not exist", async () => {
      const newDir = path.join(tempDir, "new-dir");
      expect(fs.existsSync(newDir)).toBe(false);
      await FileSystemUtils.ensureDirectory(newDir);
      expect(fs.existsSync(newDir)).toBe(true);
    });

    it("should throw error if path exists but is not a directory", async () => {
      await expect(FileSystemUtils.ensureDirectory(tempFile)).rejects.toThrow(
        "Path exists but is not a directory"
      );
    });
  });

  describe("path utilities", () => {
    it("should get filename from path", () => {
      const result = FileSystemUtils.getFileName("/path/to/file.txt");
      expect(result).toBe("file.txt");
    });

    it("should get file extension", () => {
      const result = FileSystemUtils.getFileExtension("/path/to/file.txt");
      expect(result).toBe(".txt");
    });

    it("should join paths correctly", () => {
      const result = FileSystemUtils.joinPath("home", "user", "file.txt");
      expect(result).toBe(path.join("home", "user", "file.txt"));
    });

    it("should check if path is absolute", () => {
      expect(FileSystemUtils.isAbsolutePath("/home/user")).toBe(true);
      expect(FileSystemUtils.isAbsolutePath("relative/path")).toBe(false);
    });
  });
});
