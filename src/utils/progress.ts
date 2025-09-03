/**
 * Progress Indicators and Status Messages
 *
 * Provides consistent progress indication for file operations and other tasks
 */

import chalk from "chalk";
import { Logger } from "./logger";

// Re-export ProgressType for convenience
export { ProgressType } from "./logger";

/**
 * Progress callback interface for file operations
 */
export interface ProgressInfo {
  loaded: number;
  total: number;
  percentage: number;
  speed?: number; // bytes per second
  eta?: number; // estimated time remaining in seconds
}

/**
 * Progress indicator for file operations
 */
export class ProgressIndicator {
  private id: string;
  private operation: string;
  private fileName: string;
  private startTime: number;
  private lastUpdate: number;
  private lastLoaded: number;

  constructor(id: string, operation: string, fileName: string) {
    this.id = id;
    this.operation = operation;
    this.fileName = fileName;
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
    this.lastLoaded = 0;
  }

  /**
   * Start the progress indicator
   */
  start(): void {
    const message = `${this.operation} ${this.fileName}...`;
    Logger.startProgress(this.id, message, "spinner" as any);
  }

  /**
   * Update progress with current status
   */
  update(progress: ProgressInfo): void {
    const now = Date.now();
    const timeDiff = now - this.lastUpdate;

    // Calculate speed (bytes per second)
    let speed = 0;
    if (timeDiff > 0) {
      const bytesDiff = progress.loaded - this.lastLoaded;
      speed = (bytesDiff / timeDiff) * 1000; // Convert to bytes per second
    }

    // Calculate ETA
    let eta = 0;
    if (speed > 0 && progress.total > progress.loaded) {
      eta = (progress.total - progress.loaded) / speed;
    }

    // Format progress message
    const percentage = Math.round(progress.percentage);
    const loadedFormatted = this.formatBytes(progress.loaded);
    const totalFormatted = this.formatBytes(progress.total);
    const speedFormatted = speed > 0 ? this.formatSpeed(speed) : "";
    const etaFormatted = eta > 0 ? this.formatETA(eta) : "";

    let message = `${this.operation} ${this.fileName} - ${percentage}% (${loadedFormatted}/${totalFormatted})`;

    if (speedFormatted) {
      message += ` - ${speedFormatted}`;
    }

    if (etaFormatted) {
      message += ` - ETA: ${etaFormatted}`;
    }

    Logger.updateProgress(this.id, message);

    // Update tracking variables
    this.lastUpdate = now;
    this.lastLoaded = progress.loaded;
  }

  /**
   * Complete the progress indicator successfully
   */
  succeed(message?: string): void {
    const duration = Date.now() - this.startTime;
    const defaultMessage = `${this.operation} ${
      this.fileName
    } completed (${this.formatDuration(duration)})`;
    Logger.succeedProgress(this.id, message || defaultMessage);
  }

  /**
   * Complete the progress indicator with failure
   */
  fail(message?: string): void {
    const defaultMessage = `${this.operation} ${this.fileName} failed`;
    Logger.failProgress(this.id, message || defaultMessage);
  }

  /**
   * Stop the progress indicator
   */
  stop(): void {
    Logger.stopProgress(this.id);
  }

  /**
   * Format bytes in human-readable format
   */
  private formatBytes(bytes: number): string {
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
   * Format speed in human-readable format
   */
  private formatSpeed(bytesPerSecond: number): string {
    return `${this.formatBytes(bytesPerSecond)}/s`;
  }

  /**
   * Format ETA in human-readable format
   */
  private formatETA(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(milliseconds: number): string {
    const seconds = milliseconds / 1000;
    if (seconds < 1) {
      return `${milliseconds}ms`;
    } else if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    }
  }
}

/**
 * Status message utilities for common operations
 */
export class StatusMessages {
  /**
   * Display operation start message
   */
  static startOperation(operation: string, target: string): void {
    console.log(chalk.blue(`🚀 Starting ${operation} for ${target}`));
  }

  /**
   * Display validation message
   */
  static validating(what: string): void {
    Logger.verbose(`🔍 Validating ${what}...`);
  }

  /**
   * Display authentication message
   */
  static authenticating(): void {
    Logger.verbose("🔐 Checking authentication...");
  }

  /**
   * Display repository validation message
   */
  static validatingRepository(repoId: string, repoType: string): void {
    Logger.verbose(`📋 Validating repository ${repoId} (${repoType})...`);
  }

  /**
   * Display file validation message
   */
  static validatingFile(filePath: string): void {
    Logger.verbose(`📁 Validating file ${filePath}...`);
  }

  /**
   * Display success message with details
   */
  static success(operation: string, details: Record<string, string>): void {
    console.log(chalk.green(`✅ ${operation} successful!`));
    console.log();
    console.log(chalk.bold("Details:"));

    Object.entries(details).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  }

  /**
   * Display warning message
   */
  static warning(message: string, suggestion?: string): void {
    console.log(chalk.yellow(`⚠️  ${message}`));
    if (suggestion) {
      console.log(chalk.gray(`   💡 ${suggestion}`));
    }
  }

  /**
   * Display info message with icon
   */
  static info(message: string, icon: string = "ℹ️"): void {
    console.log(chalk.blue(`${icon} ${message}`));
  }

  /**
   * Display configuration summary
   */
  static configSummary(config: Record<string, any>): void {
    if (!Logger.isVerbose()) {
      return;
    }

    Logger.verbose("Configuration Summary:");
    Object.entries(config).forEach(([key, value]) => {
      Logger.verbose(`  ${key}: ${value}`);
    });
  }
}

/**
 * Create a progress callback function for file operations
 */
export function createProgressCallback(
  progressIndicator: ProgressIndicator
): (progress: ProgressInfo) => void {
  return (progress: ProgressInfo) => {
    progressIndicator.update(progress);
  };
}

/**
 * Utility function to create and manage a progress indicator for file operations
 */
export function withProgress<T>(
  operation: string,
  fileName: string,
  task: (progressCallback: (progress: ProgressInfo) => void) => Promise<T>
): Promise<T> {
  const progressId = `${operation}-${Date.now()}`;
  const indicator = new ProgressIndicator(progressId, operation, fileName);

  indicator.start();

  const progressCallback = createProgressCallback(indicator);

  return task(progressCallback)
    .then((result) => {
      indicator.succeed();
      return result;
    })
    .catch((error) => {
      indicator.fail();
      throw error;
    });
}
