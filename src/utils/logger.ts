/**
 * Centralized Logging System
 *
 * Provides structured logging with different levels and formatting
 */

import chalk from "chalk";
import ora, { Ora } from "ora";

/**
 * Log levels for different types of messages
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  VERBOSE = 3,
  DEBUG = 4,
}

const DEFAULT_LOG_LEVEL = LogLevel.ERROR;

/**
 * Log level configuration
 */
const LOG_LEVEL_CONFIG = {
  [LogLevel.ERROR]: {
    name: "ERROR",
    color: chalk.red,
    icon: "❌",
    prefix: "[ERROR]",
  },
  [LogLevel.WARN]: {
    name: "WARN",
    color: chalk.yellow,
    icon: "⚠️",
    prefix: "[WARN]",
  },
  [LogLevel.INFO]: {
    name: "INFO",
    color: chalk.blue,
    icon: "ℹ️",
    prefix: "[INFO]",
  },
  [LogLevel.VERBOSE]: {
    name: "VERBOSE",
    color: chalk.gray,
    icon: "🔍",
    prefix: "[VERBOSE]",
  },
  [LogLevel.DEBUG]: {
    name: "DEBUG",
    color: chalk.magenta,
    icon: "🐛",
    prefix: "[DEBUG]",
  },
};

/**
 * Progress indicator types
 */
export enum ProgressType {
  SPINNER = "spinner",
  DOTS = "dots",
  LINE = "line",
  ARROW = "arrow",
}

/**
 * Centralized Logger Class
 */
export class Logger {
  private static currentLogLevel: LogLevel = LogLevel.INFO;
  private static verboseMode: boolean = false;
  private static activeSpinners: Map<string, Ora> = new Map();

  /**
   * Set the current log level
   */
  static setLogLevel(level: LogLevel): void {
    Logger.currentLogLevel = level;
  }

  /**
   * Set the log level to default
   */
  static setToDefault(): void {
    Logger.currentLogLevel = DEFAULT_LOG_LEVEL;
  }

  /**
   * Enable or disable verbose mode
   */
  static setVerbose(verbose: boolean): void {
    Logger.verboseMode = verbose;
    if (verbose) {
      Logger.currentLogLevel = Math.max(
        Logger.currentLogLevel,
        LogLevel.VERBOSE
      );
    }
  }

  /**
   * Check if verbose mode is enabled
   */
  static isVerbose(): boolean {
    return Logger.verboseMode;
  }

  /**
   * Log an error message
   */
  static error(
    message: string,
    details?: string,
    context?: Record<string, unknown>
  ): void {
    Logger.log(LogLevel.ERROR, message, details, context);
  }

  /**
   * Log a warning message
   */
  static warn(
    message: string,
    details?: string,
    context?: Record<string, unknown>
  ): void {
    Logger.log(LogLevel.WARN, message, details, context);
  }

  /**
   * Log an info message
   */
  static info(
    message: string,
    details?: string,
    context?: Record<string, unknown>
  ): void {
    Logger.log(LogLevel.INFO, message, details, context);
  }

  /**
   * Log a verbose message
   */
  static verbose(
    message: string,
    details?: string,
    context?: Record<string, unknown>
  ): void {
    Logger.log(LogLevel.VERBOSE, message, details, context);
  }

  /**
   * Log a debug message
   */
  static debug(
    message: string,
    details?: string,
    context?: Record<string, unknown>
  ): void {
    Logger.log(LogLevel.DEBUG, message, details, context);
  }

  /**
   * Log a success message (special case of info)
   */
  static success(message: string, details?: string): void {
    console.log(chalk.green(`✅ ${message}`));
    if (details && Logger.shouldLog(LogLevel.VERBOSE)) {
      console.log(chalk.gray(`   ${details}`));
    }
  }

  /**
   * Core logging method
   */
  private static log(
    level: LogLevel,
    message: string,
    details?: string,
    context?: Record<string, unknown>
  ): void {
    if (!Logger.shouldLog(level)) {
      return;
    }

    const config = LOG_LEVEL_CONFIG[level];
    const timestamp = Logger.verboseMode ? Logger.getTimestamp() : "";

    // Format main message
    const formattedMessage = Logger.verboseMode
      ? `${timestamp} ${config.prefix} ${message}`
      : `${config.icon} ${message}`;

    // Output to appropriate stream
    const output = level === LogLevel.ERROR ? console.error : console.log;
    output(config.color(formattedMessage));

    // Add details if provided and verbose mode is on
    if (details && (Logger.verboseMode || level <= LogLevel.WARN)) {
      output(chalk.gray(`   ${details}`));
    }

    // Add context in debug mode
    if (context && Logger.shouldLog(LogLevel.DEBUG)) {
      output(chalk.gray(`   Context: ${JSON.stringify(context, null, 2)}`));
    }
  }

  /**
   * Check if a log level should be output
   */
  private static shouldLog(level: LogLevel): boolean {
    return level <= Logger.currentLogLevel;
  }

  /**
   * Get formatted timestamp
   */
  private static getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Create and start a progress spinner
   */
  static startProgress(
    id: string,
    text: string,
    type: ProgressType = ProgressType.SPINNER
  ): void {
    // Stop existing spinner with same ID
    Logger.stopProgress(id);

    const spinnerType = Logger.getSpinnerType(type);
    const spinner = ora({
      text,
      spinner: spinnerType,
      color: "blue",
    } as Parameters<typeof ora>[0]).start();

    Logger.activeSpinners.set(id, spinner);
  }

  /**
   * Update progress spinner text
   */
  static updateProgress(id: string, text: string): void {
    const spinner = Logger.activeSpinners.get(id);
    if (spinner) {
      spinner.text = text;
    }
  }

  /**
   * Stop progress spinner with success
   */
  static succeedProgress(id: string, text?: string): void {
    const spinner = Logger.activeSpinners.get(id);
    if (spinner) {
      if (text) {
        spinner.succeed(text);
      } else {
        spinner.succeed();
      }
      Logger.activeSpinners.delete(id);
    }
  }

  /**
   * Stop progress spinner with failure
   */
  static failProgress(id: string, text?: string): void {
    const spinner = Logger.activeSpinners.get(id);
    if (spinner) {
      if (text) {
        spinner.fail(text);
      } else {
        spinner.fail();
      }
      Logger.activeSpinners.delete(id);
    }
  }

  /**
   * Stop progress spinner
   */
  static stopProgress(id: string): void {
    const spinner = Logger.activeSpinners.get(id);
    if (spinner) {
      spinner.stop();
      Logger.activeSpinners.delete(id);
    }
  }

  /**
   * Stop all active progress spinners
   */
  static stopAllProgress(): void {
    Logger.activeSpinners.forEach((spinner) => {
      spinner.stop();
    });
    Logger.activeSpinners.clear();
  }

  /**
   * Get spinner type for ora
   */
  private static getSpinnerType(type: ProgressType): ProgressType {
    switch (type) {
      case ProgressType.DOTS:
        return ProgressType.DOTS;
      case ProgressType.LINE:
        return ProgressType.LINE;
      case ProgressType.ARROW:
        return ProgressType.ARROW;
      case ProgressType.SPINNER:
      default:
        return ProgressType.DOTS;
    }
  }

  /**
   * Log operation start
   */
  static startOperation(operation: string, details?: string): void {
    Logger.info(`Starting ${operation}`, details);
    Logger.verbose(`Operation: ${operation}`, details);
  }

  /**
   * Log operation completion
   */
  static completeOperation(operation: string, duration?: number): void {
    const durationText = duration ? ` (${duration}ms)` : "";
    Logger.success(`Completed ${operation}${durationText}`);
  }

  /**
   * Log operation failure
   */
  static failOperation(operation: string, error: string): void {
    Logger.error(`Failed ${operation}`, error);
  }

  /**
   * Create a timed operation logger
   */
  static createTimer(operation: string): () => void {
    const startTime = Date.now();
    Logger.startOperation(operation);

    return () => {
      const duration = Date.now() - startTime;
      Logger.completeOperation(operation, duration);
    };
  }

  /**
   * Log file operation details
   */
  static logFileOperation(
    operation: "upload" | "download",
    fileName: string,
    size?: string,
    destination?: string
  ): void {
    const sizeText = size ? ` (${size})` : "";
    const destText = destination ? ` to ${destination}` : "";

    Logger.info(
      `${operation === "upload" ? "📤" : "📥"} ${
        operation === "upload" ? "Uploading" : "Downloading"
      } ${fileName}${sizeText}${destText}`
    );
  }

  /**
   * Log authentication status
   */
  static logAuthStatus(authenticated: boolean, source?: string): void {
    if (authenticated) {
      const sourceText = source ? ` (${source})` : "";
      Logger.verbose(`🔐 Authenticated${sourceText}`);
    } else {
      Logger.verbose("🔓 No authentication");
    }
  }

  /**
   * Log repository validation
   */
  static logRepoValidation(
    repoId: string,
    repoType: string,
    valid: boolean
  ): void {
    const status = valid ? "✅ Valid" : "❌ Invalid";
    Logger.verbose(`${status} repository: ${repoId} (${repoType})`);
  }
}

/**
 * Convenience functions for common logging patterns
 */
export const log = Logger;

export const startProgress = Logger.startProgress;
export const updateProgress = Logger.updateProgress;
export const succeedProgress = Logger.succeedProgress;
export const failProgress = Logger.failProgress;
export const stopProgress = Logger.stopProgress;
