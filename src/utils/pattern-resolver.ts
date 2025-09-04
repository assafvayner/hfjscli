/**
 * Pattern Resolver Utilities
 *
 * Handles glob pattern matching and file resolution for CLI operations
 */

import fg from "fast-glob";
import { FileSystemUtils } from "./files";

export interface ResolvedFile {
  path: string;
  size: number;
  fileName: string;
}

export interface PatternResolution {
  totalFiles: number;
  totalSize: number;
  files: ResolvedFile[];
}

/**
 * Utility class for resolving glob patterns to file lists
 */
export class PatternResolver {
  /**
   * Resolve a glob pattern to a list of files
   * @param pattern - Glob pattern or single file path
   * @param options - Options for glob resolution
   * @returns Promise<PatternResolution> - Resolution result
   */
  static async resolvePattern(
    pattern: string,
    options: {
      cwd?: string;
      maxFiles?: number;
    } = {}
  ): Promise<PatternResolution> {
    const { cwd = process.cwd(), maxFiles = 10000 } = options;

    try {
      // Use fast-glob to find matching files
      const globOptions: fg.Options = {
        cwd,
        onlyFiles: true, // Only match files, not directories
        absolute: true, // Return absolute paths
        followSymbolicLinks: false, // Don't follow symlinks for security
        dot: false, // Don't include hidden files by default
      };

      const matchedPaths = await fg.async(pattern, globOptions);

      // Limit the number of files to prevent overwhelming the system
      if (matchedPaths.length > maxFiles) {
        throw new Error(
          `Pattern matched ${matchedPaths.length} files, which exceeds the maximum limit of ${maxFiles}. Please use a more specific pattern.`
        );
      }

      // Get file information for each matched path
      const files: ResolvedFile[] = [];
      let totalSize = 0;

      for (const filePath of matchedPaths) {
        try {
          const size = await FileSystemUtils.getFileSize(filePath);
          const fileName = FileSystemUtils.getFileName(filePath);

          files.push({
            path: filePath,
            size,
            fileName,
          });
          totalSize += size;
        } catch (error) {
          // Skip files that can't be read (permissions, etc.)
          console.warn(`Warning: Could not read file ${filePath}: ${error}`);
          continue;
        }
      }

      return {
        totalFiles: files.length,
        totalSize,
        files,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to resolve pattern "${pattern}": ${error.message}`
        );
      }
      throw new Error(`Failed to resolve pattern "${pattern}": Unknown error`);
    }
  }

  /**
   * Validate that a pattern is safe to use
   * @param pattern - Pattern to validate
   * @returns boolean - True if pattern is safe
   */
  static isValidPattern(pattern: string): boolean {
    if (!pattern || pattern.trim() === "") {
      return false;
    }

    // Prevent dangerous patterns that could match system files
    const dangerousPatterns = [
      "/**/*", // Root filesystem
      "/etc/**/*", // System configuration
      "/usr/**/*", // System binaries
      "/var/**/*", // System variables
      "/home/**/*", // All user home directories
      "~/**/*", // User home (might expand to dangerous paths)
    ];

    const normalizedPattern = pattern.toLowerCase().trim();
    return !dangerousPatterns.some((dangerous) =>
      normalizedPattern.startsWith(dangerous.toLowerCase())
    );
  }

  /**
   * Get a human-readable summary of a pattern resolution
   * @param resolution - Pattern resolution result
   * @returns string - Human-readable summary
   */
  static getSummary(resolution: PatternResolution): string {
    const fileCount = resolution.totalFiles;
    const totalSize = FileSystemUtils.formatBytes(resolution.totalSize);

    if (fileCount === 0) {
      return "No files matched the pattern";
    } else if (fileCount === 1) {
      return `1 file (${totalSize})`;
    } else {
      return `${fileCount} files (${totalSize} total)`;
    }
  }
}
