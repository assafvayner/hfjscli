/**
 * Authentication Manager for Hugging Face Hub
 * Handles token retrieval from various sources and validation
 */

import { whoAmI } from "@huggingface/hub";
import {
  AuthConfig,
  AuthManager as IAuthManager,
  ErrorType,
  CLIError,
} from "../types";

export class AuthManager implements IAuthManager {
  private token: string | null = null;
  private tokenSource: AuthConfig["source"] | null = null;

  /**
   * Retrieve authentication token from various sources in order of priority:
   * 1. Explicitly set token (via setToken)
   * 2. Environment variable (HF_TOKEN)
   * 3. Hugging Face config file (future enhancement)
   */
  getToken(): string | null {
    // Return cached token if available
    if (this.token) {
      return this.token;
    }

    // Check environment variable
    const envToken = process.env.HF_TOKEN;
    if (envToken) {
      this.token = envToken;
      this.tokenSource = "env";
      return this.token;
    }

    // No token found
    return null;
  }

  /**
   * Validate a Hugging Face token by making an API call
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      // Use whoAmI API to validate the token
      await whoAmI({ credentials: { accessToken: token } });
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  /**
   * Set authentication token explicitly (from command line flag)
   */
  setToken(token: string): void {
    this.token = token;
    this.tokenSource = "flag";
  }

  /**
   * Get the source of the current token
   */
  getTokenSource(): AuthConfig["source"] | null {
    return this.tokenSource;
  }

  /**
   * Clear cached token (useful for testing)
   */
  clearToken(): void {
    this.token = null;
    this.tokenSource = null;
  }

  /**
   * Get authentication configuration
   */
  getAuthConfig(): AuthConfig {
    const token = this.getToken();
    return {
      token: token || undefined,
      source: this.tokenSource || "config",
    };
  }

  /**
   * Validate current authentication and throw appropriate errors
   */
  async validateAuthentication(
    requireAuth: boolean = false
  ): Promise<string | null> {
    const token = this.getToken();

    if (!token && requireAuth) {
      throw this.createAuthError(
        "No authentication token found",
        "Authentication is required for this operation. Please provide a token using --token flag or set HF_TOKEN environment variable.",
        [
          "Set HF_TOKEN environment variable: export HF_TOKEN=your_token_here",
          "Use --token flag: hfjscli command --token your_token_here",
          "Get a token from: https://huggingface.co/settings/tokens",
        ]
      );
    }
    if (!token) {
      return null;
    }

    const isValid = await this.validateToken(token);
    if (!isValid) {
      throw this.createAuthError(
        "Invalid authentication token",
        "The provided token is invalid or expired.",
        [
          "Check if your token is correct",
          "Generate a new token at: https://huggingface.co/settings/tokens",
          "Ensure the token has appropriate permissions",
        ]
      );
    }

    return token;
  }

  /**
   * Create a standardized authentication error
   */
  private createAuthError(
    message: string,
    details: string,
    suggestions: string[]
  ): CLIError {
    return {
      type: ErrorType.AUTHENTICATION_ERROR,
      message,
      details,
      suggestions,
    };
  }
}

// Export singleton instance
export const authManager = new AuthManager();
