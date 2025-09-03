/**
 * Base Command Class
 *
 * Provides common functionality for all CLI commands using centralized error handling and logging
 */

import { ErrorType, CLIError } from "../types";
import { ErrorHandler, ExtendedCLIError } from "../utils/errors";
import { Logger } from "../utils/logger";

/**
 * Base class for all CLI commands
 */
export abstract class BaseCommand {
  protected verbose: boolean = false;

  /**
   * Set verbose mode
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
    Logger.setVerbose(verbose);
    ErrorHandler.setVerbose(verbose);
  }

  /**
   * Log verbose messages
   */
  protected logVerbose(message: string, details?: string): void {
    Logger.verbose(message, details);
  }

  /**
   * Log info messages
   */
  protected logInfo(message: string, details?: string): void {
    Logger.info(message, details);
  }

  /**
   * Log success messages
   */
  protected logSuccess(message: string, details?: string): void {
    Logger.success(message, details);
  }

  /**
   * Log warning messages
   */
  protected logWarning(message: string, details?: string): void {
    Logger.warn(message, details);
  }

  /**
   * Log error messages
   */
  protected logError(message: string, details?: string): void {
    Logger.error(message, details);
  }

  /**
   * Create a standardized CLI error using the centralized error handler
   */
  protected createError(
    type: ErrorType,
    message: string,
    details?: string,
    suggestions?: string[],
    context?: Record<string, unknown>
  ): CLIError {
    return ErrorHandler.createError(
      type,
      message,
      details,
      suggestions,
      context
    );
  }

  /**
   * Handle and display errors using the centralized error handler
   */
  protected handleError(error: ExtendedCLIError): void {
    ErrorHandler.displayError(
      ErrorHandler.createError(
        error.type || ErrorType.VALIDATION_ERROR,
        error.message || "An unexpected error occurred",
        error.details,
        error.suggestions,
        error.context
      )
    );
  }

  /**
   * Start an operation with logging
   */
  protected startOperation(operation: string, details?: string): void {
    Logger.startOperation(operation, details);
  }

  /**
   * Complete an operation with logging
   */
  protected completeOperation(operation: string, duration?: number): void {
    Logger.completeOperation(operation, duration);
  }

  /**
   * Fail an operation with logging
   */
  protected failOperation(operation: string, error: string): void {
    Logger.failOperation(operation, error);
  }

  /**
   * Create a timer for operations
   */
  protected createTimer(operation: string): () => void {
    return Logger.createTimer(operation);
  }

  /**
   * Abstract method that must be implemented by subclasses
   */
  abstract execute(...args: unknown[]): Promise<void>;
}
