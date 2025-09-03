/**
 * Download Command Handler
 *
 * Handles the download command for downloading files from Hugging Face Hub
 */

import { Command } from "commander";
import * as path from "path";
import {
  DownloadOptions,
  RepoType,
  ErrorType,
  HFClientWrapper,
  DownloadResult,
} from "../types";
import { authManager } from "../auth/manager";
import { createHFClient } from "../client/hf-client";
import { FileSystemUtils } from "../utils/files";
import { BaseCommand } from "./base";
import { Logger } from "../utils/logger";
import { StatusMessages } from "../utils/progress";
import { ErrorHandler } from "../utils/errors";

interface DownloadCommandOptions {
  verbose?: boolean;
  token?: string;
  localDir?: string;
  repoType?: string;
}

/**
 * Download command implementation
 */
export class DownloadCommand extends BaseCommand {
  private hfClient: HFClientWrapper;

  constructor(hfClient?: HFClientWrapper) {
    super();
    this.hfClient = hfClient || createHFClient();
  }

  /**
   * Configure the download command with Commander.js
   */
  static configure(program: Command): Command {
    return program
      .command("download")
      .description("Download a file from Hugging Face Hub")
      .argument("<repo-id>", "Repository ID (e.g., username/repo-name)")
      .argument("<file-path>", "Path to the file in the repository to download")
      .option("-t, --token <token>", "Hugging Face access token")
      .option(
        "-d, --local-dir <dir>",
        "Local directory to save the file (defaults to current directory)"
      )
      .option(
        "--repo-type <type>",
        "Repository type (model, dataset, space)",
        "model"
      )
      .option("-v, --verbose", "Enable verbose logging", false)
      .action(async (repoId, filePath, options) => {
        const downloadCommand = new DownloadCommand();
        try {
          await downloadCommand.execute(repoId, filePath, options);
        } catch (error) {
          // Let the global error handler manage the error and exit
          ErrorHandler.handleError(error, 1);
        }
      });
  }

  /**
   * Execute the download command
   */
  async execute(
    repoId: string,
    filePath: string,
    options: DownloadCommandOptions
  ): Promise<void> {
    // Set verbose mode (inherits from global if not specified)
    const verbose = options.verbose;
    this.setVerbose(verbose || false);

    // Merge global token with command-specific token (command-specific takes precedence)
    if (options.token) {
      authManager.setToken(options.token);
    }

    // Validate and prepare download options
    const downloadOptions = await this.prepareDownloadOptions(
      repoId,
      filePath,
      options
    );

    // Perform the download
    await this.performDownload(downloadOptions);
  }

  /**
   * Prepare and validate download options
   */
  private async prepareDownloadOptions(
    repoId: string,
    filePath: string,
    options: DownloadCommandOptions
  ): Promise<DownloadOptions> {
    this.logVerbose("Preparing download options...");

    // Validate repository ID
    if (!repoId || repoId.trim() === "") {
      throw this.createError(
        ErrorType.VALIDATION_ERROR,
        "Repository ID is required",
        'Please provide a valid repository ID in the format "username/repo-name"'
      );
    }

    // Validate repository ID format
    if (!this.isValidRepoId(repoId)) {
      throw this.createError(
        ErrorType.VALIDATION_ERROR,
        `Invalid repository ID format: ${repoId}`,
        'Repository ID should be in the format "username/repo-name"'
      );
    }

    // Validate file path
    if (!filePath || filePath.trim() === "") {
      throw this.createError(
        ErrorType.VALIDATION_ERROR,
        "File path is required",
        "Please provide a valid file path to download"
      );
    }

    // Validate repository type
    const repoType = this.validateRepoType(options.repoType);

    // Handle local directory
    let localDir = options.localDir;
    if (localDir) {
      // Resolve and validate local directory path
      localDir = FileSystemUtils.resolvePath(localDir);

      // Check if local directory exists or can be created
      const dirValidation =
        await FileSystemUtils.validateDirectoryPath(localDir);
      if (!dirValidation.valid) {
        throw this.createError(
          ErrorType.PERMISSION_ERROR,
          dirValidation.error || "Local directory validation failed",
          "Please check that the directory exists or can be created, and you have write permissions"
        );
      }
    } else {
      // Default to current working directory
      localDir = process.cwd();
    }

    // Handle authentication (download may or may not require authentication)
    let token = options.token;
    if (token) {
      authManager.setToken(token);
    }

    // Get token if available (but don't require it for public repos)
    token = token || authManager.getToken() || undefined;

    this.logVerbose(`Repository: ${repoId}`);
    this.logVerbose(`File: ${filePath}`);
    this.logVerbose(`Local Directory: ${localDir}`);
    this.logVerbose(`Repository Type: ${repoType}`);

    const downloadOptions: DownloadOptions = {
      repoId,
      filePath,
      localDir,
      repoType,
      verbose: this.verbose,
    };
    if (token) {
      downloadOptions.token = token;
    }
    return downloadOptions;
  }

  /**
   * Perform the actual download operation
   */
  private async performDownload(options: DownloadOptions): Promise<void> {
    const fileName = path.basename(options.filePath);
    const fileSize = ""; // We don't know the size beforehand for downloads

    // Log file operation with new logging system
    Logger.logFileOperation("download", fileName, fileSize, options.repoId);

    // Start progress indicator
    const progressId = "download-operation";
    Logger.startProgress(progressId, "Preparing download...");

    try {
      // Validate repository exists and is accessible
      Logger.updateProgress(progressId, "Validating repository...");
      StatusMessages.validatingRepository(options.repoId, options.repoType);

      const isValidRepo = await this.hfClient.validateRepository(
        options.repoId,
        options.repoType
      );

      Logger.logRepoValidation(options.repoId, options.repoType, isValidRepo);

      if (!isValidRepo) {
        Logger.failProgress(progressId);
        throw ErrorHandler.createError(
          ErrorType.VALIDATION_ERROR,
          `Repository not found or not accessible: ${options.repoId}`,
          "Please check the repository ID and ensure it exists and is accessible",
          ErrorHandler.createContextualSuggestions(ErrorType.VALIDATION_ERROR, {
            repoId: options.repoId,
            operation: "download",
          }),
          { repoId: options.repoId, repoType: options.repoType }
        );
      }

      // Perform download
      Logger.updateProgress(progressId, `Downloading ${fileName}...`);
      this.logVerbose("Starting file download...");

      const result = await this.hfClient.downloadFile(options);

      if (result.success) {
        Logger.succeedProgress(progressId, `Download completed successfully`);
        this.displaySuccessMessage(result, options);
      } else {
        Logger.failProgress(progressId);

        // Provide specific error messages based on common failure scenarios
        let errorMessage = result.error || "Download failed";
        let suggestions = [
          "Please check your internet connection and try again",
        ];

        if (
          result.error?.includes("404") ||
          result.error?.includes("not found")
        ) {
          errorMessage = `File not found: ${options.filePath}`;
          suggestions = ["Please check that the file exists in the repository"];
        } else if (
          result.error?.includes("403") ||
          result.error?.includes("401")
        ) {
          errorMessage = "Access denied to the repository or file";
          suggestions = [
            "Please check your authentication token and repository permissions",
          ];
        }

        throw ErrorHandler.createError(
          ErrorType.NETWORK_ERROR,
          errorMessage,
          "Download operation failed",
          suggestions,
          { repoId: options.repoId, fileName }
        );
      }
    } catch (error) {
      Logger.failProgress(progressId);
      throw error;
    }
  }

  /**
   * Display success message after successful download
   */
  private displaySuccessMessage(
    result: DownloadResult,
    options: DownloadOptions
  ): void {
    const fileName = path.basename(options.filePath);

    const details: Record<string, string> = {
      File: fileName,
      Repository: options.repoId,
      Type: options.repoType,
    };

    if (result.localPath) {
      details["Saved to"] = result.localPath;
    }

    if (result.fileSize && this.verbose) {
      const humanSize = this.formatFileSize(result.fileSize);
      details["Size"] = humanSize;
    }

    StatusMessages.success("Download", details);
  }

  /**
   * Format file size in human-readable format
   */
  private formatFileSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Validate repository ID format
   */
  private isValidRepoId(repoId: string): boolean {
    // Repository ID should be in format "username/repo-name"
    const repoIdPattern =
      /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?\/[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
    return repoIdPattern.test(repoId);
  }

  /**
   * Validate and normalize repository type
   */
  private validateRepoType(repoType?: string): RepoType {
    const validTypes: RepoType[] = ["model", "dataset", "space"];

    if (!repoType) {
      return "model"; // Default to model
    }

    const normalizedType = repoType.toLowerCase() as RepoType;

    if (!validTypes.includes(normalizedType)) {
      throw this.createError(
        ErrorType.VALIDATION_ERROR,
        `Invalid repository type: ${repoType}`,
        `Repository type must be one of: ${validTypes.join(", ")}`
      );
    }

    return normalizedType;
  }
}
