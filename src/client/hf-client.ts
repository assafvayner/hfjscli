/**
 * Hugging Face Client Wrapper
 *
 * This module provides a wrapper around the @huggingface/hub library
 * with error handling, retry logic, and repository validation.
 */

import {
  uploadFile as hfUploadFile,
  downloadFile as hfDownloadFile,
  listFiles,
} from "@huggingface/hub";
import {
  HFClientWrapper,
  UploadOptions,
  DownloadOptions,
  UploadResult,
  DownloadResult,
  RepoType,
  ErrorType,
  CLIError,
} from "../types/index";
import * as fs from "fs-extra";
import * as path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { authManager } from "../auth/manager";
import { Blob } from "node:buffer";
import { ReadableStream } from "node:stream/web";
import { Response } from "undici-types";

/**
 * Configuration for retry logic
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
};

/**
 * HFClientWrapper implementation that encapsulates @huggingface/hub library calls
 */
export class HFClient implements HFClientWrapper {
  private accessToken: string | undefined;
  private retryConfig: RetryConfig;

  constructor(token?: string, retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.accessToken = token;
    this.retryConfig = retryConfig;
  }

  /**
   * Upload a file to Hugging Face Hub
   */
  async uploadFile(options: UploadOptions): Promise<UploadResult> {
    try {
      // Validate inputs
      await this.validateUploadInputs(options);

      // Check if file exists locally
      if (!(await fs.pathExists(options.filePath))) {
        throw this.createError(
          ErrorType.FILE_NOT_FOUND,
          `Local file not found: ${options.filePath}`,
          "Please check the file path and ensure the file exists."
        );
      }

      // Create streaming file blob instead of loading entire file into memory
      const streamingBlob = await this.createStreamingFileBlob(
        options.filePath
      );

      // Perform upload with retry logic
      const result = await this.withRetry(async () => {
        const token = options.token || this.accessToken;
        const uploadOptions: Parameters<typeof hfUploadFile>[0] = {
          repo: options.repoId,
          file: {
            path: path.basename(options.filePath),
            content: streamingBlob,
          },
          commitTitle:
            options.message || `Upload ${path.basename(options.filePath)}`,
          useXet: true,
        };

        if (token) {
          uploadOptions.accessToken = token;
        }

        return await hfUploadFile(uploadOptions);
      });

      return {
        success: true,
        fileUrl: `https://huggingface.co/${
          options.repoId
        }/blob/main/${path.basename(options.filePath)}`,
        commitSha: result.commit?.oid || "unknown",
      };
    } catch (error) {
      console.error(error);
      return {
        success: false,
        error: this.handleError(error as Error).message,
      };
    }
  }

  /**
   * Download a file from Hugging Face Hub
   */
  async downloadFile(options: DownloadOptions): Promise<DownloadResult> {
    try {
      // Validate inputs
      await this.validateDownloadInputs(options);

      // Determine local file path
      const localDir = options.localDir || process.cwd();
      const localPath = path.join(localDir, path.basename(options.filePath));

      // Ensure local directory exists
      await fs.ensureDir(path.dirname(localPath));

      // Perform download with retry logic
      const response = await this.withRetry(async () => {
        const token = options.token || this.accessToken;
        const downloadOptions: Parameters<typeof hfDownloadFile>[0] = {
          repo: options.repoId,
          path: options.filePath,
          xet: true,
        };

        if (token) {
          downloadOptions.accessToken = token;
        }

        return await hfDownloadFile(downloadOptions);
      });

      if (!response) {
        throw new Error("Download failed: No response received");
      }

      // Stream the blob to file instead of loading into memory
      const fileSize = await this.streamBlobToFile(response, localPath);

      return {
        success: true,
        localPath,
        fileSize,
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error as Error).message,
      };
    }
  }

  /**
   * Create a streaming file blob that reads data incrementally
   */
  private async createStreamingFileBlob(filePath: string): Promise<Blob> {
    // Create a streaming blob using ReadableStream
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;

    // Create a ReadableStream that reads the file in chunks
    const stream = new ReadableStream({
      start(controller) {
        const readStream = fs.createReadStream(filePath, {
          highWaterMark: 8 * 1024 * 1024, // 8MiB chunks
        });

        readStream.on("data", (chunk: Buffer | string) => {
          if (typeof chunk === "string") {
            chunk = Buffer.from(chunk, "utf8");
          }
          controller.enqueue(new Uint8Array(chunk));
        });

        readStream.on("end", () => {
          controller.close();
        });

        readStream.on("error", (error) => {
          controller.error(error);
        });
      },
    });

    // Create a Response from the stream and get its blob
    const response = new Response(stream, {
      headers: {
        "Content-Length": fileSize.toString(),
      },
    });

    return response.blob();
  }

  /**
   * Stream blob data to file instead of loading into memory
   */
  private async streamBlobToFile(
    blob: Blob,
    localPath: string
  ): Promise<number> {
    // Get the blob's stream
    const stream = blob.stream();

    if (!stream) {
      throw new Error("Blob stream is null");
    }

    // Convert ReadableStream to Node.js Readable stream
    const readable = Readable.fromWeb(stream);

    // Create write stream
    const writeStream = fs.createWriteStream(localPath);

    let totalBytes = 0;

    // Track bytes written for progress
    readable.on("data", (chunk) => {
      totalBytes += chunk.length;
    });

    try {
      // Use pipeline for efficient streaming with automatic cleanup
      await pipeline(readable, writeStream);
      return totalBytes;
    } catch (error) {
      // Clean up partial file on error
      try {
        await fs.unlink(localPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Validate if a repository exists and is accessible
   */
  async validateRepository(
    repoId: string,
    repoType: RepoType
  ): Promise<boolean> {
    try {
      // Try to list files to check if repository exists and is accessible
      await this.withRetry(async () => {
        const listOptions: Parameters<typeof listFiles>[0] = {
          repo: { name: repoId, type: repoType },
        };
        if (this.accessToken) {
          listOptions.accessToken = this.accessToken;
        }
        const files = listFiles(listOptions);
        // Just get the first file to test access
        const iterator = files[Symbol.asyncIterator]();
        await iterator.next();
      });

      return true;
    } catch {
      // Repository doesn't exist or is not accessible
      return false;
    }
  }

  /**
   * Validate upload inputs
   */
  private async validateUploadInputs(options: UploadOptions): Promise<void> {
    if (!options.repoId || options.repoId.trim() === "") {
      throw this.createError(
        ErrorType.VALIDATION_ERROR,
        "Repository ID is required",
        'Please provide a valid repository ID in the format "username/repo-name"'
      );
    }

    if (!options.filePath || options.filePath.trim() === "") {
      throw this.createError(
        ErrorType.VALIDATION_ERROR,
        "File path is required",
        "Please provide a valid file path to upload"
      );
    }

    if (!this.isValidRepoType(options.repoType)) {
      throw this.createError(
        ErrorType.VALIDATION_ERROR,
        `Invalid repository type: ${options.repoType}`,
        "Repository type must be one of: model, dataset, space"
      );
    }
  }

  /**
   * Validate download inputs
   */
  private async validateDownloadInputs(
    options: DownloadOptions
  ): Promise<void> {
    if (!options.repoId || options.repoId.trim() === "") {
      throw this.createError(
        ErrorType.VALIDATION_ERROR,
        "Repository ID is required",
        'Please provide a valid repository ID in the format "username/repo-name"'
      );
    }

    if (!options.filePath || options.filePath.trim() === "") {
      throw this.createError(
        ErrorType.VALIDATION_ERROR,
        "File path is required",
        "Please provide a valid file path to download"
      );
    }

    if (!this.isValidRepoType(options.repoType)) {
      throw this.createError(
        ErrorType.VALIDATION_ERROR,
        `Invalid repository type: ${options.repoType}`,
        "Repository type must be one of: model, dataset, space"
      );
    }
  }

  /**
   * Check if repo type is valid
   */
  private isValidRepoType(repoType: string): repoType is RepoType {
    return ["model", "dataset", "space"].includes(repoType);
  }

  /**
   * Retry logic with exponential backoff
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain error types
        if (this.shouldNotRetry(lastError)) {
          throw error;
        }

        // If this was the last attempt, throw the error
        if (attempt === this.retryConfig.maxRetries) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(2, attempt),
          this.retryConfig.maxDelay
        );

        // Add some jitter to prevent thundering herd
        const jitteredDelay = delay + Math.random() * 1000;

        await this.sleep(jitteredDelay);
      }
    }

    throw lastError!;
  }

  /**
   * Determine if an error should not be retried
   */
  private shouldNotRetry(error: Error): boolean {
    // Don't retry authentication errors
    if (error.message?.includes("401") || error.message?.includes("403")) {
      return true;
    }

    // Don't retry validation errors
    if (error.message?.includes("400") || error.message?.includes("422")) {
      return true;
    }

    // Don't retry file not found errors
    if (error.message?.includes("404")) {
      return true;
    }

    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Handle and categorize errors
   */
  private handleError(error: Error): CLIError {
    if (error instanceof Error && "type" in error) {
      return error as CLIError;
    }

    const message = error.message || error.toString();

    // Categorize error based on message content
    if (
      message.includes("401") ||
      message.includes("403") ||
      message.includes("authentication")
    ) {
      return this.createError(
        ErrorType.AUTHENTICATION_ERROR,
        "Authentication failed",
        "Please check your Hugging Face token and ensure it has the necessary permissions."
      );
    }

    if (message.includes("404")) {
      return this.createError(
        ErrorType.FILE_NOT_FOUND,
        "Repository or file not found",
        "Please check the repository ID and file path are correct."
      );
    }

    if (message.includes("429") || message.includes("rate limit")) {
      return this.createError(
        ErrorType.RATE_LIMIT_ERROR,
        "Rate limit exceeded",
        "Please wait a moment before trying again."
      );
    }

    if (message.includes("ENOENT") || message.includes("EACCES")) {
      return this.createError(
        ErrorType.PERMISSION_ERROR,
        "File system permission error",
        "Please check file permissions and ensure the directory is writable."
      );
    }

    // Default to network error for unknown errors
    return this.createError(
      ErrorType.NETWORK_ERROR,
      `Network or API error: ${message}`,
      "Please check your internet connection and try again."
    );
  }

  /**
   * Create a standardized CLI error
   */
  private createError(
    type: ErrorType,
    message: string,
    suggestion?: string
  ): CLIError {
    const error = new Error(message);
    return {
      type,
      suggestions: suggestion ? [suggestion] : [],
      ...error,
    };
  }
}

/**
 * Factory function to create HFClient instance
 */
export function createHFClient(token?: string): HFClientWrapper {
  token = token || authManager.getToken() || undefined;
  return new HFClient(token);
}
