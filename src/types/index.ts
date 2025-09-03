/**
 * Core type definitions and interfaces for hfjscli
 */

// Error type enums for categorizing different types of errors
export enum ErrorType {
  AUTHENTICATION_ERROR = "auth_error",
  NETWORK_ERROR = "network_error",
  FILE_NOT_FOUND = "file_not_found",
  PERMISSION_ERROR = "permission_error",
  VALIDATION_ERROR = "validation_error",
  RATE_LIMIT_ERROR = "rate_limit_error",
}

// Repository types supported by Hugging Face Hub
export type RepoType = "model" | "dataset" | "space";

// Authentication configuration types
export interface AuthConfig {
  token?: string | undefined;
  source: "flag" | "env" | "config";
}

export interface AuthManager {
  getToken(): string | null;
  validateToken(token: string): Promise<boolean>;
  setToken(token: string): void;
}

// CLI command option interfaces
export interface BaseCommandOptions {
  token?: string;
  repoType: RepoType;
  verbose: boolean;
}

export interface UploadOptions extends BaseCommandOptions {
  repoId: string;
  filePath: string;
  message?: string;
}

export interface DownloadOptions extends BaseCommandOptions {
  repoId: string;
  filePath: string;
  localDir?: string;
}

// Operation result interfaces
export interface UploadResult {
  success: boolean;
  fileUrl?: string;
  commitSha?: string;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  localPath?: string;
  fileSize?: number;
  error?: string;
}

// Error handling interfaces
export interface CLIError {
  type: ErrorType;
  message: string;
  details?: string;
  suggestions?: string[];
}

// Configuration model
export interface CLIConfig {
  defaultRepoType: RepoType;
  defaultToken?: string;
  verboseLogging: boolean;
}

// Hugging Face client wrapper interface
export interface HFClientWrapper {
  uploadFile(options: UploadOptions): Promise<UploadResult>;
  downloadFile(options: DownloadOptions): Promise<DownloadResult>;
  validateRepository(repoId: string, repoType: RepoType): Promise<boolean>;
}

// Progress callback type for file operations (enhanced)
export interface ProgressInfo {
  loaded: number;
  total: number;
  percentage: number;
  speed?: number; // bytes per second
  eta?: number; // estimated time remaining in seconds
}

export type ProgressCallback = (progress: ProgressInfo) => void;

// Extended options with progress callback
export interface UploadOptionsWithProgress extends UploadOptions {
  onProgress?: ProgressCallback;
}

export interface DownloadOptionsWithProgress extends DownloadOptions {
  onProgress?: ProgressCallback;
}
