/**
 * Centralized Error Handling System
 *
 * Provides standardized error handling, categorization, and user-friendly messaging
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import chalk from "chalk";
import { ErrorType, CLIError } from "../types";

/**
 * Error severity levels for categorization
 */
export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

/**
 * Extended error interface with additional metadata
 */
export interface ExtendedCLIError extends Omit<CLIError, "details"> {
  severity: ErrorSeverity;
  code?: string;
  timestamp: Date;
  context?: Record<string, any>;
  details?: string;
}

/**
 * Error category mappings for better organization
 */
export const ERROR_CATEGORIES = {
  [ErrorType.AUTHENTICATION_ERROR]: {
    severity: ErrorSeverity.HIGH,
    icon: "🔐",
    color: chalk.red,
    defaultSuggestions: [
      "Check your Hugging Face token",
      "Visit https://huggingface.co/settings/tokens to generate a new token",
      "Ensure your token has the required permissions",
    ],
  },
  [ErrorType.NETWORK_ERROR]: {
    severity: ErrorSeverity.MEDIUM,
    icon: "🌐",
    color: chalk.yellow,
    defaultSuggestions: [
      "Check your internet connection",
      "Try again in a few moments",
      "Check Hugging Face Hub status at https://status.huggingface.co",
    ],
  },
  [ErrorType.FILE_NOT_FOUND]: {
    severity: ErrorSeverity.MEDIUM,
    icon: "📁",
    color: chalk.yellow,
    defaultSuggestions: [
      "Verify the file path is correct",
      "Check if the file exists",
      "Ensure you have read permissions for the file",
    ],
  },
  [ErrorType.PERMISSION_ERROR]: {
    severity: ErrorSeverity.HIGH,
    icon: "🚫",
    color: chalk.red,
    defaultSuggestions: [
      "Check file/directory permissions",
      "Ensure you have write access to the target location",
      "Try running with appropriate permissions",
    ],
  },
  [ErrorType.VALIDATION_ERROR]: {
    severity: ErrorSeverity.LOW,
    icon: "⚠️",
    color: chalk.yellow,
    defaultSuggestions: [
      "Check the command syntax",
      "Verify all required parameters are provided",
      "Use --help for usage information",
    ],
  },
  [ErrorType.RATE_LIMIT_ERROR]: {
    severity: ErrorSeverity.MEDIUM,
    icon: "⏱️",
    color: chalk.yellow,
    defaultSuggestions: [
      "Wait a few minutes before trying again",
      "Consider using authentication to increase rate limits",
      "Reduce the frequency of requests",
    ],
  },
};

/**
 * Centralized Error Handler Class
 */
export class ErrorHandler {
  private static verbose: boolean = false;

  /**
   * Set verbose mode for detailed error reporting
   */
  static setVerbose(verbose: boolean): void {
    ErrorHandler.verbose = verbose;
  }

  /**
   * Create a standardized CLI error with enhanced metadata
   */
  static createError(
    type: ErrorType,
    message: string,
    details?: string,
    suggestions?: string[],
    context?: Record<string, any>,
    code?: string
  ): ExtendedCLIError {
    const category = ERROR_CATEGORIES[type];

    const error: ExtendedCLIError = {
      type,
      message,
      suggestions: suggestions || category.defaultSuggestions,
      severity: category.severity,
      timestamp: new Date(),
    };

    if (details !== undefined) {
      error.details = details;
    }
    if (code !== undefined) {
      error.code = code;
    }
    if (context !== undefined) {
      error.context = context;
    }

    return error;
  }

  /**
   * Handle and display errors with consistent formatting
   */
  static handleError(error: any, exitCode: number = 1): void {
    const cliError = ErrorHandler.normalizeError(error);
    ErrorHandler.displayError(cliError);

    if (ErrorHandler.verbose) {
      ErrorHandler.displayVerboseErrorInfo(error, cliError);
    }

    process.exit(exitCode);
  }

  /**
   * Display error without exiting (for non-fatal errors)
   */
  static displayError(error: ExtendedCLIError): void {
    const category = ERROR_CATEGORIES[error.type];

    // Main error message
    console.error(category.color(`${category.icon} Error: ${error.message}`));

    // Additional details
    if (error.details) {
      console.error(chalk.gray(`   ${error.details}`));
    }

    // Error code and severity (in verbose mode)
    if (ErrorHandler.verbose && (error.code || error.severity)) {
      const metadata = [];
      if (error.code) metadata.push(`Code: ${error.code}`);
      if (error.severity) metadata.push(`Severity: ${error.severity}`);
      console.error(chalk.gray(`   [${metadata.join(", ")}]`));
    }

    // Suggestions
    if (error.suggestions && error.suggestions.length > 0) {
      console.error();
      console.error(chalk.cyan("💡 Suggestions:"));
      error.suggestions.forEach((suggestion: string) => {
        console.error(chalk.cyan(`   • ${suggestion}`));
      });
    }

    console.error(); // Add spacing
  }

  /**
   * Display verbose error information
   */
  private static displayVerboseErrorInfo(
    originalError: any,
    cliError: ExtendedCLIError
  ): void {
    console.error(chalk.gray("🔍 Verbose Error Information:"));

    // Timestamp
    console.error(
      chalk.gray(`   Timestamp: ${cliError.timestamp.toISOString()}`)
    );

    // Error type and severity
    console.error(chalk.gray(`   Type: ${cliError.type}`));
    console.error(chalk.gray(`   Severity: ${cliError.severity}`));

    // Context information
    if (cliError.context) {
      console.error(
        chalk.gray(`   Context: ${JSON.stringify(cliError.context, null, 2)}`)
      );
    }

    // Stack trace
    if (originalError && originalError.stack) {
      console.error(chalk.gray("   Stack Trace:"));
      console.error(chalk.gray(`   ${originalError.stack}`));
    }

    console.error(); // Add spacing
  }

  /**
   * Normalize any error into an ExtendedCLIError
   */
  private static normalizeError(error: any): ExtendedCLIError {
    // If it's already a CLI error, enhance it
    if (ErrorHandler.isCliError(error)) {
      return {
        ...error,
        severity:
          (error as any).severity || ERROR_CATEGORIES[error.type].severity,
        timestamp: (error as any).timestamp || new Date(),
        code: (error as any).code,
      };
    }

    // Convert standard errors
    if (error instanceof Error) {
      return ErrorHandler.createError(
        ErrorHandler.categorizeStandardError(error),
        error.message,
        undefined,
        undefined,
        { originalError: error.name }
      );
    }

    // Handle string errors
    if (typeof error === "string") {
      return ErrorHandler.createError(ErrorType.VALIDATION_ERROR, error);
    }

    // Handle unknown errors
    return ErrorHandler.createError(
      ErrorType.VALIDATION_ERROR,
      "An unexpected error occurred",
      String(error)
    );
  }

  /**
   * Categorize standard JavaScript errors
   */
  private static categorizeStandardError(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    if (message.includes("enoent") || message.includes("not found")) {
      return ErrorType.FILE_NOT_FOUND;
    }

    if (message.includes("eacces") || message.includes("permission")) {
      return ErrorType.PERMISSION_ERROR;
    }

    if (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("connection")
    ) {
      return ErrorType.NETWORK_ERROR;
    }

    if (
      message.includes("401") ||
      message.includes("403") ||
      message.includes("unauthorized")
    ) {
      return ErrorType.AUTHENTICATION_ERROR;
    }

    if (message.includes("429") || message.includes("rate limit")) {
      return ErrorType.RATE_LIMIT_ERROR;
    }

    return ErrorType.VALIDATION_ERROR;
  }

  /**
   * Check if an error is a CLI error
   */
  private static isCliError(error: any): error is CLIError {
    return (
      error &&
      typeof error.type === "string" &&
      typeof error.message === "string" &&
      Object.values(ErrorType).includes(error.type)
    );
  }

  /**
   * Create context-specific error suggestions
   */
  static createContextualSuggestions(
    errorType: ErrorType,
    context: Record<string, any>
  ): string[] {
    const baseSuggestions = ERROR_CATEGORIES[errorType].defaultSuggestions;
    const contextualSuggestions: string[] = [];

    switch (errorType) {
      case ErrorType.AUTHENTICATION_ERROR:
        if (context.tokenSource === "env") {
          contextualSuggestions.push(
            "Check your HF_TOKEN environment variable"
          );
        }
        if (context.operation === "upload") {
          contextualSuggestions.push(
            "Upload operations require authentication"
          );
        }
        break;

      case ErrorType.FILE_NOT_FOUND:
        if (context.filePath) {
          contextualSuggestions.push(
            `Check if file exists: ${context.filePath}`
          );
        }
        break;

      case ErrorType.NETWORK_ERROR:
        if (context.repoId) {
          contextualSuggestions.push(
            `Verify repository exists: ${context.repoId}`
          );
        }
        break;
    }

    return [...contextualSuggestions, ...baseSuggestions];
  }
}

/**
 * Convenience functions for creating specific error types
 */
export const createAuthError = (
  message: string,
  details?: string,
  context?: Record<string, any>
) =>
  ErrorHandler.createError(
    ErrorType.AUTHENTICATION_ERROR,
    message,
    details,
    undefined,
    context
  );

export const createNetworkError = (
  message: string,
  details?: string,
  context?: Record<string, any>
) =>
  ErrorHandler.createError(
    ErrorType.NETWORK_ERROR,
    message,
    details,
    undefined,
    context
  );

export const createFileError = (
  message: string,
  details?: string,
  context?: Record<string, any>
) =>
  ErrorHandler.createError(
    ErrorType.FILE_NOT_FOUND,
    message,
    details,
    undefined,
    context
  );

export const createPermissionError = (
  message: string,
  details?: string,
  context?: Record<string, any>
) =>
  ErrorHandler.createError(
    ErrorType.PERMISSION_ERROR,
    message,
    details,
    undefined,
    context
  );

export const createValidationError = (
  message: string,
  details?: string,
  context?: Record<string, any>
) =>
  ErrorHandler.createError(
    ErrorType.VALIDATION_ERROR,
    message,
    details,
    undefined,
    context
  );

export const createRateLimitError = (
  message: string,
  details?: string,
  context?: Record<string, any>
) =>
  ErrorHandler.createError(
    ErrorType.RATE_LIMIT_ERROR,
    message,
    details,
    undefined,
    context
  );
