import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

// Promisified fs functions for async/await usage
const stat = promisify(fs.stat);
const access = promisify(fs.access);
const mkdir = promisify(fs.mkdir);

/**
 * File system utility functions for the hfjscli tool
 */
export class FileSystemUtils {
  /**
   * Check if a file or directory exists
   * @param filePath - Path to check
   * @returns Promise<boolean> - True if exists, false otherwise
   */
  static async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a path is a file
   * @param filePath - Path to check
   * @returns Promise<boolean> - True if it's a file, false otherwise
   */
  static async isFile(filePath: string): Promise<boolean> {
    try {
      const stats = await stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Check if a path is a directory
   * @param dirPath - Path to check
   * @returns Promise<boolean> - True if it's a directory, false otherwise
   */
  static async isDirectory(dirPath: string): Promise<boolean> {
    try {
      const stats = await stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
  /**
   * Validate if a file path is valid and accessible
   * @param filePath - Path to validate
   * @returns Promise<{valid: boolean, error?: string}> - Validation result
   */
  static async validateFilePath(
    filePath: string
  ): Promise<{ valid: boolean; error?: string }> {
    if (!filePath || filePath.trim() === "") {
      return { valid: false, error: "File path cannot be empty" };
    }

    // Normalize the path to handle relative paths and resolve '..' and '.'
    const normalizedPath = path.resolve(filePath);

    // Check if the file exists
    const exists = await this.exists(normalizedPath);
    if (!exists) {
      return { valid: false, error: `File does not exist: ${normalizedPath}` };
    }

    // Check if it's actually a file (not a directory)
    const isFile = await this.isFile(normalizedPath);
    if (!isFile) {
      return { valid: false, error: `Path is not a file: ${normalizedPath}` };
    }

    return { valid: true };
  }

  /**
   * Validate if a directory path is valid or can be created
   * @param dirPath - Directory path to validate
   * @returns Promise<{valid: boolean, error?: string}> - Validation result
   */
  static async validateDirectoryPath(
    dirPath: string
  ): Promise<{ valid: boolean; error?: string }> {
    if (!dirPath || dirPath.trim() === "") {
      return { valid: false, error: "Directory path cannot be empty" };
    }

    const normalizedPath = path.resolve(dirPath);

    // Check if the directory exists
    const exists = await this.exists(normalizedPath);
    if (exists) {
      // Check if it's actually a directory
      const isDir = await this.isDirectory(normalizedPath);
      if (!isDir) {
        return {
          valid: false,
          error: `Path exists but is not a directory: ${normalizedPath}`,
        };
      }
      return { valid: true };
    }

    // Directory doesn't exist, check if we can create it
    try {
      // Check if parent directory exists and is writable
      const parentDir = path.dirname(normalizedPath);
      const parentExists = await this.exists(parentDir);

      if (!parentExists) {
        // Try to create parent directories recursively
        await this.ensureDirectory(parentDir);
      }

      // Check write permissions on parent directory
      const permissions = await this.checkPermissions(parentDir);
      if (!permissions.writable) {
        return {
          valid: false,
          error: `No write permission for parent directory: ${parentDir}`,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Cannot create directory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }
  /*
   *
   * Get file size in bytes
   * @param filePath - Path to the file
   * @returns Promise<number> - File size in bytes
   * @throws Error if file doesn't exist or is not accessible
   */
  static async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }
      return stats.size;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Path is not a file")
      ) {
        throw error; // Re-throw the original error
      }
      if (error instanceof Error) {
        throw new Error(
          `Cannot get file size for ${filePath}: ${error.message}`
        );
      }
      throw new Error(`Cannot get file size for ${filePath}: Unknown error`);
    }
  }

  /**
   * Get human-readable file size
   * @param filePath - Path to the file
   * @returns Promise<string> - Human-readable file size (e.g., "1.5 MB")
   */
  static async getHumanReadableFileSize(filePath: string): Promise<string> {
    const bytes = await this.getFileSize(filePath);
    return this.formatBytes(bytes);
  }

  /**
   * Format bytes into human-readable format
   * @param bytes - Number of bytes
   * @returns string - Formatted size (e.g., "1.5 MB")
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  } /**

   * Check file permissions
   * @param filePath - Path to check
   * @returns Promise<{readable: boolean, writable: boolean, executable: boolean}> - Permission status
   */
  static async checkPermissions(
    filePath: string
  ): Promise<{ readable: boolean; writable: boolean; executable: boolean }> {
    const permissions = {
      readable: false,
      writable: false,
      executable: false,
    };

    try {
      // Check read permission
      await access(filePath, fs.constants.R_OK);
      permissions.readable = true;
    } catch {
      // Read permission denied
    }

    try {
      // Check write permission
      await access(filePath, fs.constants.W_OK);
      permissions.writable = true;
    } catch {
      // Write permission denied
    }

    try {
      // Check execute permission
      await access(filePath, fs.constants.X_OK);
      permissions.executable = true;
    } catch {
      // Execute permission denied
    }

    return permissions;
  }

  /**
   * Ensure directory exists, create if it doesn't
   * @param dirPath - Directory path to ensure
   * @returns Promise<void>
   * @throws Error if directory cannot be created
   */
  static async ensureDirectory(dirPath: string): Promise<void> {
    try {
      const exists = await this.exists(dirPath);
      if (!exists) {
        await mkdir(dirPath, { recursive: true });
      } else {
        // Verify it's actually a directory
        const isDir = await this.isDirectory(dirPath);
        if (!isDir) {
          throw new Error(`Path exists but is not a directory: ${dirPath}`);
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Path exists but is not a directory")
      ) {
        throw error; // Re-throw the original error
      }
      if (error instanceof Error) {
        throw new Error(`Cannot ensure directory ${dirPath}: ${error.message}`);
      }
      throw new Error(`Cannot ensure directory ${dirPath}: Unknown error`);
    }
  } /**
   
* Get the directory path from a file path
   * @param filePath - Full file path
   * @returns string - Directory path
   */
  static getDirectoryPath(filePath: string): string {
    return path.dirname(path.resolve(filePath));
  }

  /**
   * Get the filename from a file path
   * @param filePath - Full file path
   * @returns string - Filename with extension
   */
  static getFileName(filePath: string): string {
    return path.basename(filePath);
  }

  /**
   * Get file extension
   * @param filePath - File path
   * @returns string - File extension (including the dot, e.g., ".txt")
   */
  static getFileExtension(filePath: string): string {
    return path.extname(filePath);
  }

  /**
   * Join paths safely
   * @param paths - Path segments to join
   * @returns string - Joined path
   */
  static joinPath(...paths: string[]): string {
    return path.join(...paths);
  }

  /**
   * Resolve path to absolute path
   * @param filePath - Path to resolve
   * @returns string - Absolute path
   */
  static resolvePath(filePath: string): string {
    return path.resolve(filePath);
  }

  /**
   * Check if a path is absolute
   * @param filePath - Path to check
   * @returns boolean - True if absolute, false if relative
   */
  static isAbsolutePath(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }
}
