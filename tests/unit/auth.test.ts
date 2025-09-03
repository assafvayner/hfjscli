/**
 * Unit tests for AuthManager
 */

import { AuthManager } from "../../src/auth/manager";
import { ErrorType } from "../../src/types";

// Mock the @huggingface/hub module
jest.mock("@huggingface/hub", () => ({
  whoAmI: jest.fn(),
}));

import { whoAmI } from "@huggingface/hub";

describe("AuthManager", () => {
  let authManager: AuthManager;
  const mockWhoAmI = whoAmI as jest.MockedFunction<typeof whoAmI>;

  beforeEach(() => {
    authManager = new AuthManager();
    // Clear any cached tokens
    authManager.clearToken();
    // Clear environment variables
    delete process.env.HF_TOKEN;
    // Reset mocks
    jest.clearAllMocks();
  });

  describe("getToken", () => {
    it("should return null when no token is available", async () => {
      const token = authManager.getToken();
      expect(token).toBeNull();
    });

    it("should return token from environment variable", async () => {
      const testToken = "hf_test_token_123";
      process.env.HF_TOKEN = testToken;

      const token = authManager.getToken();
      expect(token).toBe(testToken);
    });

    it("should return cached token on subsequent calls", async () => {
      const testToken = "hf_test_token_123";
      process.env.HF_TOKEN = testToken;

      const token1 = authManager.getToken();
      const token2 = authManager.getToken();

      expect(token1).toBe(testToken);
      expect(token2).toBe(testToken);
    });

    it("should prioritize explicitly set token over environment", async () => {
      const envToken = "hf_env_token";
      const flagToken = "hf_flag_token";

      process.env.HF_TOKEN = envToken;
      authManager.setToken(flagToken);

      const token = authManager.getToken();
      expect(token).toBe(flagToken);
    });
  });

  describe("setToken", () => {
    it("should set token and update source", async () => {
      const testToken = "hf_test_token_123";
      authManager.setToken(testToken);

      const token = authManager.getToken();
      const source = authManager.getTokenSource();

      expect(token).toBe(testToken);
      expect(source).toBe("flag");
    });
  });

  describe("validateToken", () => {
    it("should return true for valid token", async () => {
      const testToken = "hf_valid_token";
      mockWhoAmI.mockResolvedValueOnce({ name: "testuser" } as any);

      const isValid = await authManager.validateToken(testToken);
      expect(isValid).toBe(true);
      expect(mockWhoAmI).toHaveBeenCalledWith({
        credentials: { accessToken: testToken },
      });
    });

    it("should return false for invalid token", async () => {
      const testToken = "hf_invalid_token";
      mockWhoAmI.mockRejectedValueOnce(new Error("Invalid token"));

      const isValid = await authManager.validateToken(testToken);
      expect(isValid).toBe(false);
      expect(mockWhoAmI).toHaveBeenCalledWith({
        credentials: { accessToken: testToken },
      });
    });

    it("should return false when API call fails", async () => {
      const testToken = "hf_test_token";
      mockWhoAmI.mockRejectedValueOnce(new Error("Network error"));

      const isValid = await authManager.validateToken(testToken);
      expect(isValid).toBe(false);
    });
  });

  describe("getTokenSource", () => {
    it("should return null when no token is set", () => {
      const source = authManager.getTokenSource();
      expect(source).toBeNull();
    });

    it("should return 'flag' when token is set via setToken", () => {
      authManager.setToken("test_token");
      const source = authManager.getTokenSource();
      expect(source).toBe("flag");
    });

    it("should return 'env' when token is from environment", async () => {
      process.env.HF_TOKEN = "env_token";
      authManager.getToken();
      const source = authManager.getTokenSource();
      expect(source).toBe("env");
    });
  });

  describe("clearToken", () => {
    it("should clear cached token and source", async () => {
      authManager.setToken("test_token");
      expect(authManager.getToken()).toBe("test_token");
      expect(authManager.getTokenSource()).toBe("flag");

      authManager.clearToken();
      expect(authManager.getTokenSource()).toBeNull();
    });
  });

  describe("getAuthConfig", () => {
    it("should return config with no token when none available", async () => {
      const config = await authManager.getAuthConfig();
      expect(config).toEqual({
        token: undefined,
        source: "config",
      });
    });

    it("should return config with token and source", async () => {
      const testToken = "hf_test_token";
      authManager.setToken(testToken);

      const config = await authManager.getAuthConfig();
      expect(config).toEqual({
        token: testToken,
        source: "flag",
      });
    });
  });

  describe("validateAuthentication", () => {
    it("should return null when no auth required and no token", async () => {
      const token = await authManager.validateAuthentication(false);
      expect(token).toBeNull();
    });

    it("should throw error when auth required but no token", async () => {
      await expect(
        authManager.validateAuthentication(true)
      ).rejects.toMatchObject({
        type: ErrorType.AUTHENTICATION_ERROR,
        message: "No authentication token found",
        suggestions: expect.arrayContaining([
          expect.stringContaining("Set HF_TOKEN environment variable"),
          expect.stringContaining("Use --token flag"),
          expect.stringContaining("Get a token from"),
        ]),
      });
    });

    it("should return token when valid", async () => {
      const testToken = "hf_valid_token";
      authManager.setToken(testToken);
      mockWhoAmI.mockResolvedValueOnce({ name: "testuser" } as any);

      const token = await authManager.validateAuthentication(true);
      expect(token).toBe(testToken);
    });

    it("should throw error when token is invalid", async () => {
      const testToken = "hf_invalid_token";
      authManager.setToken(testToken);
      mockWhoAmI.mockRejectedValueOnce(new Error("Invalid token"));

      await expect(
        authManager.validateAuthentication(true)
      ).rejects.toMatchObject({
        type: ErrorType.AUTHENTICATION_ERROR,
        message: "Invalid authentication token",
        suggestions: expect.arrayContaining([
          expect.stringContaining("Check if your token is correct"),
          expect.stringContaining("Generate a new token"),
          expect.stringContaining(
            "Ensure the token has appropriate permissions"
          ),
        ]),
      });
    });

    it("should validate token even when auth not required", async () => {
      const testToken = "hf_invalid_token";
      authManager.setToken(testToken);
      mockWhoAmI.mockRejectedValueOnce(new Error("Invalid token"));

      await expect(
        authManager.validateAuthentication(false)
      ).rejects.toMatchObject({
        type: ErrorType.AUTHENTICATION_ERROR,
        message: "Invalid authentication token",
      });
    });
  });
});
