#!/usr/bin/env node

/**
 * hfjscli - Command Line Interface for Hugging Face Hub
 *
 * Main entry point that sets up the CLI with commander.js framework
 */

import { Command } from "commander";
import chalk from "chalk";
import { UploadCommand } from "./commands/upload";
import { DownloadCommand } from "./commands/download";
import { Logger } from "./utils/logger";
import { ErrorHandler } from "./utils/errors";
import { authManager } from "./auth/manager";

/**
 * Main CLI application class
 */
class HFJSCli {
  private program: Command;

  constructor() {
    this.program = new Command();
    this.setupProgram();
    this.setupCommands();
    this.setupGlobalHandlers();
  }

  /**
   * Set up the main program configuration
   */
  private setupProgram(): void {
    this.program
      .name("hfjscli")
      .description(
        "A command-line interface for uploading and downloading files from Hugging Face Hub"
      )
      .version("1.0.0", "-v, --version", "Display version number")
      .helpOption("-h, --help", "Display help for command")
      .addHelpText(
        "after",
        `
Examples:
  $ hfjscli upload username/my-model model.bin
  $ hfjscli download username/my-model model.bin
  $ hfjscli upload username/my-dataset data.csv --repo-type dataset
  $ hfjscli download username/my-model config.json --local-dir ./models
  
For more information, visit: https://huggingface.co/docs
`
      );

    // Global options
    this.program
      .option("-t, --token <token>", "Hugging Face access token")
      .option("--verbose", "Enable verbose logging", false);
  }

  /**
   * Set up subcommands
   */
  private setupCommands(): void {
    // Configure upload command
    UploadCommand.configure(this.program);

    // Configure download command
    DownloadCommand.configure(this.program);

    // Handle unknown commands
    this.program.on("command:*", (operands) => {
      Logger.error(`Unknown command: ${operands[0]}`);
      console.error();
      console.error("Available commands:");
      console.error("  upload    Upload a file to Hugging Face Hub");
      console.error("  download  Download a file from Hugging Face Hub");
      console.error();
      console.error("Run 'hfjscli --help' for more information.");
      this.exitWithCode(1);
    });
  }

  /**
   * Set up global error handlers and process event listeners
   */
  private setupGlobalHandlers(): void {
    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      Logger.error("Uncaught Exception", error.message);
      if (Logger.isVerbose()) {
        Logger.debug("Stack trace", error.stack);
      }
      this.cleanup();
      this.exitWithCode(1);
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      Logger.error("Unhandled Promise Rejection", String(reason));
      if (Logger.isVerbose()) {
        Logger.debug("Promise", String(promise));
      }
      this.cleanup();
      this.exitWithCode(1);
    });

    // Handle process termination signals
    process.on("SIGINT", () => {
      Logger.info("Received SIGINT, shutting down gracefully...");
      this.cleanup();
      this.exitWithCode(0);
    });

    process.on("SIGTERM", () => {
      Logger.info("Received SIGTERM, shutting down gracefully...");
      this.cleanup();
      this.exitWithCode(0);
    });
  }

  /**
   * Parse command line arguments and execute
   */
  async run(argv?: string[]): Promise<void> {
    try {
      // Set up global verbose mode and authentication from global options
      await this.setupGlobalOptions(argv);

      // Parse and execute commands
      await this.program.parseAsync(argv);
    } catch (error) {
      this.handleGlobalError(error);
      this.exitWithCode(1);
    }
  }

  /**
   * Set up global options before command parsing
   */
  private async setupGlobalOptions(argv?: string[]): Promise<void> {
    // Parse global options without executing commands
    const parsedArgs = argv || process.argv;

    // Don't enable verbose mode for version or help commands
    const isVersionCommand =
      parsedArgs.includes("--version") || parsedArgs.includes("-v");
    const isHelpCommand =
      parsedArgs.includes("--help") || parsedArgs.includes("-h");

    // Check for verbose flag (but not if it's the version flag)
    const verboseFlag = parsedArgs.includes("--verbose");
    if (verboseFlag && !isVersionCommand && !isHelpCommand) {
      Logger.setVerbose(true);
      ErrorHandler.setVerbose(true);
      Logger.verbose("Verbose mode enabled");
    }

    // Check for global token flag
    const tokenIndex = parsedArgs.findIndex(
      (arg) => arg === "--token" || arg === "-t"
    );
    if (tokenIndex !== -1 && tokenIndex + 1 < parsedArgs.length) {
      const token = parsedArgs[tokenIndex + 1];
      authManager.setToken(token);
      if (Logger.isVerbose()) {
        Logger.verbose("Global authentication token set");
      }
    }

    // Log authentication status (only if verbose and not version/help)
    if (Logger.isVerbose() && !isVersionCommand && !isHelpCommand) {
      const authConfig = await authManager.getAuthConfig();
      Logger.logAuthStatus(!!authConfig.token, authConfig.source);
    }
  }

  /**
   * Handle global errors that aren't caught by individual commands
   */
  private handleGlobalError(error: any): void {
    // Use centralized error handler for consistent error formatting
    if (this.isCliError(error)) {
      ErrorHandler.displayError(error);
    } else {
      // Convert unknown errors to CLI errors
      const cliError = ErrorHandler.createError(
        error.type || "validation_error",
        error.message || "An unexpected error occurred",
        error.details || String(error),
        error.suggestions || [
          "Check your command syntax and try again",
          "Use --verbose flag for more detailed error information",
          "Report persistent issues at: https://github.com/huggingface/hfjscli/issues",
        ],
        { originalError: error.name || "Unknown" }
      );
      ErrorHandler.displayError(cliError);
    }
  }

  /**
   * Check if an error is a CLI error
   */
  private isCliError(error: any): boolean {
    return (
      error &&
      typeof error.type === "string" &&
      typeof error.message === "string"
    );
  }

  /**
   * Clean up resources before exit
   */
  private cleanup(): void {
    // Stop all active progress indicators
    Logger.stopAllProgress();

    // Clear authentication cache
    authManager.clearToken();

    Logger.verbose("Cleanup completed");
  }

  /**
   * Exit with proper code and cleanup
   */
  private exitWithCode(code: number): void {
    this.cleanup();
    process.exit(code);
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const cli = new HFJSCli();
  await cli.run();
}

// Execute main function if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red("❌ Fatal error:"), error.message || error);
    process.exit(1);
  });
}

export { HFJSCli };
