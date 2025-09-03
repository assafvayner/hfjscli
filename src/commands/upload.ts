/**
 * Upload Command Handler
 *
 * Handles the upload command for uploading files to Hugging Face Hub
 */

import { Command } from "commander";
import { UploadOptions, RepoType, ErrorType, HFClientWrapper } from "../types";
import { authManager } from "../auth/manager";
import { createHFClient } from "../client/hf-client";
import { FileSystemUtils } from "../utils/files";
import { BaseCommand } from "./base";
import { Logger } from "../utils/logger";
import { StatusMessages } from "../utils/progress";
import { ErrorHandler } from "../utils/errors";

/**
 * Upload command implementation
 */
export class UploadCommand extends BaseCommand {
  private hfClient: HFClientWrapper;

  constructor(hfClient?: HFClientWrapper) {
    super();
    this.hfClient = hfClient || createHFClient();
  }

  /**
   * Configure the upload command with Commander.js
   */
  static configure(program: Command): Command {
    return program
      .command("upload")
      .description("Upload a file to Hugging Face Hub")
      .argument("<repo-id>", "Repository ID (e.g., username/repo-name)")
      .argument("<file-path>", "Path to the file to upload")
      .option("-t, --token <token>", "Hugging Face access token")
      .option("-m, --message <message>", "Commit message for the upload")
      .option(
        "--repo-type <type>",
        "Repository type (model, dataset, space)",
        "model"
      )
      .option("-v, --verbose", "Enable verbose logging", false)
      .action(async (repoId: string, filePath: string, options: any) => {
        const uploadCommand = new UploadCommand();
        try {
          await uploadCommand.execute(repoId, filePath, options);
        } catch (error) {
          // Let the global error handler manage the error and exit
          ErrorHandler.handleError(error, 1);
        }
      });
  }

  /**
   * Execute the upload command
   */
  async execute(repoId: string, filePath: string, options: any): Promise<void> {
    // Set verbose mode (inherits from global if not specified)
    const verbose = options.verbose || Logger.isVerbose();
    this.setVerbose(verbose);

    // Merge global token with command-specific token (command-specific takes precedence)
    if (options.token) {
      authManager.setToken(options.token);
    }

    // Validate and prepare upload options
    const uploadOptions = await this.prepareUploadOptions(
      repoId,
      filePath,
      options
    );

    // Perform the upload
    await this.performUpload(uploadOptions);
  }

  /**
   * Prepare and validate upload options
   */
  private async prepareUploadOptions(
    repoId: string,
    filePath: string,
    options: any
  ): Promise<UploadOptions> {
    this.logVerbose("Preparing upload options...");

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
        "Please provide a valid file path to upload"
      );
    }

    // Resolve and validate file path
    const resolvedFilePath = FileSystemUtils.resolvePath(filePath);
    const fileValidation = await FileSystemUtils.validateFilePath(
      resolvedFilePath
    );

    if (!fileValidation.valid) {
      throw this.createError(
        ErrorType.FILE_NOT_FOUND,
        fileValidation.error || "File validation failed",
        "Please check that the file exists and is accessible"
      );
    }

    // Validate repository type
    const repoType = this.validateRepoType(options.repoType);

    // Handle authentication
    let token = options.token;
    if (token) {
      authManager.setToken(token);
    }

    // Validate authentication (upload requires authentication)
    token = await authManager.validateAuthentication(true);
    if (!token) {
      throw this.createError(
        ErrorType.AUTHENTICATION_ERROR,
        "Authentication failed",
        "Please check your authentication credentials"
      );
    }

    // Generate commit message if not provided
    const fileName = FileSystemUtils.getFileName(resolvedFilePath);
    const commitMessage = options.message || `Upload ${fileName}`;

    this.logVerbose(`Repository: ${repoId}`);
    this.logVerbose(`File: ${resolvedFilePath}`);
    this.logVerbose(`Repository Type: ${repoType}`);
    this.logVerbose(`Commit Message: ${commitMessage}`);

    return {
      repoId,
      filePath: resolvedFilePath,
      token,
      message: commitMessage,
      repoType,
      verbose: this.verbose,
    };
  }

  /**
   * Perform the actual upload operation
   */
  private async performUpload(options: UploadOptions): Promise<void> {
    const fileName = FileSystemUtils.getFileName(options.filePath);
    const fileSize = await FileSystemUtils.getHumanReadableFileSize(
      options.filePath
    );

    // Log file operation with new logging system
    Logger.logFileOperation("upload", fileName, fileSize, options.repoId);

    // Start progress indicator
    const progressId = "upload-operation";
    Logger.startProgress(progressId, "Preparing upload...");

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
          "Please check the repository ID and ensure you have access to it",
          ErrorHandler.createContextualSuggestions(ErrorType.VALIDATION_ERROR, {
            repoId: options.repoId,
            operation: "upload",
          }),
          { repoId: options.repoId, repoType: options.repoType }
        );
      }

      // Perform upload
      Logger.updateProgress(progressId, `Uploading ${fileName}...`);
      this.logVerbose("Starting file upload...");

      const result = await this.hfClient.uploadFile(options);

      if (result.success) {
        Logger.succeedProgress(progressId, `Upload completed successfully`);
        this.displaySuccessMessage(result, options);
      } else {
        Logger.failProgress(progressId);
        throw ErrorHandler.createError(
          ErrorType.NETWORK_ERROR,
          result.error || "Upload failed",
          "Please check your internet connection and try again",
          ErrorHandler.createContextualSuggestions(ErrorType.NETWORK_ERROR, {
            operation: "upload",
            repoId: options.repoId,
          }),
          { repoId: options.repoId, fileName }
        );
      }
    } catch (error) {
      Logger.failProgress(progressId);
      throw error;
    }
  }

  /**
   * Display success message after successful upload
   */
  private displaySuccessMessage(result: any, options: UploadOptions): void {
    const fileName = FileSystemUtils.getFileName(options.filePath);

    const details: Record<string, string> = {
      File: fileName,
      Repository: options.repoId,
      Type: options.repoType,
    };

    if (result.fileUrl) {
      details["URL"] = result.fileUrl;
    }

    if (result.commitSha && this.verbose) {
      details["Commit"] = result.commitSha;
    }

    if (options.message) {
      details["Message"] = options.message;
    }

    StatusMessages.success("Upload", details);
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
  private validateRepoType(repoType: string): RepoType {
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
