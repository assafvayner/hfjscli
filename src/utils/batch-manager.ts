/**
 * Batch Manager Utilities
 *
 * Handles batch processing for file operations
 */

import { ResolvedFile } from "./pattern-resolver";

export interface BatchOperationOptions {
  batchSize: number;
  maxConcurrency?: number;
  delayBetweenBatches?: number;
}

export interface BatchProgress {
  currentBatch: number;
  totalBatches: number;
  filesProcessed: number;
  totalFiles: number;
  currentBatchSize: number;
}

export type BatchProcessor<T> = (
  batch: ResolvedFile[],
  progress: BatchProgress
) => Promise<T>;

/**
 * Utility class for processing files in batches
 */
export class BatchManager {
  private static readonly DEFAULT_BATCH_SIZE = 1000;
  private static readonly DEFAULT_MAX_CONCURRENCY = 1;
  private static readonly DEFAULT_DELAY_MS = 100;

  /**
   * Process files in batches
   * @param files - Array of files to process
   * @param processor - Function to process each batch
   * @param options - Batch processing options
   * @returns Promise<T[]> - Array of results from each batch
   */
  static async processBatches<T>(
    files: ResolvedFile[],
    processor: BatchProcessor<T>,
    options: Partial<BatchOperationOptions> = {}
  ): Promise<T[]> {
    const {
      batchSize = this.DEFAULT_BATCH_SIZE,
      maxConcurrency = this.DEFAULT_MAX_CONCURRENCY,
      delayBetweenBatches = this.DEFAULT_DELAY_MS,
    } = options;

    if (files.length === 0) {
      return [];
    }

    // Split files into batches
    const batches = this.createBatches(files, batchSize);
    const totalBatches = batches.length;
    const totalFiles = files.length;

    console.log(
      `Processing ${totalFiles} files in ${totalBatches} batch(es) (max ${batchSize} files per batch)`
    );

    const results: T[] = [];
    let filesProcessed = 0;

    // Process batches with limited concurrency
    for (let i = 0; i < totalBatches; i += maxConcurrency) {
      const batchPromises: Promise<T>[] = [];
      const endIndex = Math.min(i + maxConcurrency, totalBatches);

      // Create promises for concurrent batches
      for (let j = i; j < endIndex; j++) {
        const batch = batches[j];
        const progress: BatchProgress = {
          currentBatch: j + 1,
          totalBatches,
          filesProcessed,
          totalFiles,
          currentBatchSize: batch.length,
        };

        batchPromises.push(processor(batch, progress));
      }

      // Wait for all concurrent batches to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Update files processed count
      for (let j = i; j < endIndex; j++) {
        filesProcessed += batches[j].length;
      }

      // Add delay between batch groups if specified
      if (delayBetweenBatches > 0 && endIndex < totalBatches) {
        await this.sleep(delayBetweenBatches);
      }
    }

    console.log(
      `Successfully processed ${filesProcessed} files in ${totalBatches} batch(es)`
    );
    return results;
  }

  /**
   * Create batches from an array of files
   * @param files - Array of files
   * @param batchSize - Maximum size of each batch
   * @returns ResolvedFile[][] - Array of batches
   */
  private static createBatches(
    files: ResolvedFile[],
    batchSize: number
  ): ResolvedFile[][] {
    const batches: ResolvedFile[][] = [];

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      batches.push(batch);
    }

    return batches;
  }

  /**
   * Calculate optimal batch size based on file sizes and system constraints
   * @param files - Array of files
   * @param maxBatchSize - Maximum allowed batch size
   * @param maxBatchSizeBytes - Maximum batch size in bytes (optional)
   * @returns number - Optimal batch size
   */
  static calculateOptimalBatchSize(
    files: ResolvedFile[],
    maxBatchSize: number = this.DEFAULT_BATCH_SIZE,
    maxBatchSizeBytes?: number
  ): number {
    if (!maxBatchSizeBytes) {
      return Math.min(maxBatchSize, files.length);
    }

    // Calculate average file size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const averageSize = totalSize / files.length;

    // Calculate batch size based on size limit
    const sizeLimitedBatchSize = Math.floor(maxBatchSizeBytes / averageSize);

    return Math.min(maxBatchSize, sizeLimitedBatchSize, files.length);
  }

  /**
   * Get batch statistics
   * @param files - Array of files
   * @param batchSize - Batch size
   * @returns Object with batch statistics
   */
  static getBatchStats(files: ResolvedFile[], batchSize: number) {
    const totalFiles = files.length;
    const totalBatches = Math.ceil(totalFiles / batchSize);
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    return {
      totalFiles,
      totalBatches,
      totalSize,
      averageFilesPerBatch: totalFiles / totalBatches,
      averageBatchSize: totalSize / totalBatches,
    };
  }

  /**
   * Sleep for specified milliseconds
   * @param ms - Milliseconds to sleep
   * @returns Promise<void>
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
