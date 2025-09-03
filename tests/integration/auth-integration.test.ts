/**
 * Integration tests for authentication scenarios
 * Tests token validation, error cases, and authentication flow
 */

import { authManager, AuthManager } from "../../src/auth/manager";
import { ErrorType } from "../../src/types";
import { whoAmI } from "@huggingface/hub";

// Mock the @huggingface/hub library
jest.mock("@huggingface/hub", () => ({
  whoAmI: jest.fn(),
}));

const mockWhoAmI = whoAmI as jest.MockedFunction<typeof whoAmI>;

// Mock user response that matches the expected type
const mockUserResponse = {
  type: "user" as const,
  id: "test-user-id",
  name: "testuser",
  fullname: "Test User",
  email: "test@example.com",
  emailVerified: true,
  avatarUrl: "https://example.com/avatar.jpg",
  isPro: false,
  canPay: false,
  periodEnd: null,
  orgs: [],
  auth: {
    type: "access_token" as const,
    accessToken: {
      displayName: "test-token",
      role: "read" as const,
      createdAt: new Date(),
    },
  },
};

describe("Authentication Integration Tests", () => {
  let testAuthManager: AuthManager;

  beforeEach(() => {
    // Create fresh auth manager for each test
    testAuthManager = new AuthManager();

    // Clear environment variables
    delete process.env.HF_TOKEN;

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.HF_TOKEN;
  });

  describe("Token Retrieval Integration", () => {
    it("should retrieve token from explicit setToken call", async () => {
      const testToken = "hf_test_token_123";
      testAuthManager.setToken(testToken);

      const token = testAuthManager.getToken();
      expect(token).toBe(testToken);
      expect(testAuthManager.getTokenSource()).toBe("flag");
    });

    it("should retrieve token from environment variable", async () => {
      const testToken = "hf_env_token_456";
      process.env.HF_TOKEN = testToken;

      const token = testAuthManager.getToken();
      expect(token).toBe(testToken);
      expect(testAuthManager.getTokenSource()).toBe("env");
    });

    it("should prioritize explicit token over environment", async () => {
      const explicitToken = "hf_explicit_token";
      const envToken = "hf_env_token";

      process.env.HF_TOKEN = envToken;
      testAuthManager.setToken(explicitToken);

      const token = testAuthManager.getToken();
      expect(token).toBe(explicitToken);
      expect(testAuthManager.getTokenSource()).toBe("flag");
    });

    it("should return null when no token is available", async () => {
      const token = testAuthManager.getToken();
      expect(token).toBeNull();
      expect(testAuthManager.getTokenSource()).toBeNull();
    });

    it("should cache token after first retrieval", async () => {
      process.env.HF_TOKEN = "hf_cached_token";

      // First call
      const token1 = testAuthManager.getToken();

      // Change environment (should not affect cached token)
      process.env.HF_TOKEN = "hf_different_token";

      // Second call should return cached token
      const token2 = testAuthManager.getToken();

      expect(token1).toBe("hf_cached_token");
      expect(token2).toBe("hf_cached_token");
    });
  });

  describe("Token Validation Integration", () => {
    it("should validate correct token successfully", async () => {
      mockWhoAmI.mockResolvedValue(mockUserResponse);

      const isValid = await testAuthManager.validateToken("valid_token");
      expect(isValid).toBe(true);
      expect(mockWhoAmI).toHaveBeenCalledWith({
        credentials: { accessToken: "valid_token" },
      });
    });

    it("should reject invalid token", async () => {
      mockWhoAmI.mockRejectedValue(new Error("Invalid token"));

      const isValid = await testAuthManager.validateToken("invalid_token");
      expect(isValid).toBe(false);
    });

    it("should handle network errors during validation", async () => {
      mockWhoAmI.mockRejectedValue(new Error("Network error"));

      const isValid = await testAuthManager.validateToken(
        "network_error_token"
      );
      expect(isValid).toBe(false);
    });

    it("should handle API rate limiting during validation", async () => {
      mockWhoAmI.mockRejectedValue(new Error("Rate limit exceeded"));

      const isValid = await testAuthManager.validateToken("rate_limited_token");
      expect(isValid).toBe(false);
    });
  });

  describe("Authentication Validation Integration", () => {
    it("should pass validation when auth not required and no token", async () => {
      const token = await testAuthManager.validateAuthentication(false);
      expect(token).toBeNull();
    });

    it("should pass validation when auth not required but token available", async () => {
      mockWhoAmI.mockResolvedValue(mockUserResponse);

      testAuthManager.setToken("valid_token");

      const token = await testAuthManager.validateAuthentication(false);
      expect(token).toBe("valid_token");
    });

    it("should fail validation when auth required but no token", async () => {
      await expect(
        testAuthManager.validateAuthentication(true)
      ).rejects.toMatchObject({
        type: ErrorType.AUTHENTICATION_ERROR,
        message: expect.stringContaining("No authentication token found"),
        suggestions: expect.arrayContaining([
          expect.stringContaining("HF_TOKEN"),
          expect.stringContaining("--token"),
          expect.stringContaining("https://huggingface.co/settings/tokens"),
        ]),
      });
    });

    it("should fail validation when token is invalid", async () => {
      mockWhoAmI.mockRejectedValue(new Error("Invalid token"));

      testAuthManager.setToken("invalid_token");

      await expect(
        testAuthManager.validateAuthentication(true)
      ).rejects.toMatchObject({
        type: ErrorType.AUTHENTICATION_ERROR,
        message: expect.stringContaining("Invalid authentication token"),
        suggestions: expect.arrayContaining([
          expect.stringContaining("Check if your token is correct"),
          expect.stringContaining("Generate a new token"),
          expect.stringContaining("appropriate permissions"),
        ]),
      });
    });

    it("should pass validation when token is valid", async () => {
      mockWhoAmI.mockResolvedValue(mockUserResponse);

      testAuthManager.setToken("valid_token");

      const token = await testAuthManager.validateAuthentication(true);
      expect(token).toBe("valid_token");
    });
  });

  describe("Authentication Configuration Integration", () => {
    it("should return correct auth config with explicit token", async () => {
      testAuthManager.setToken("explicit_token");

      const config = await testAuthManager.getAuthConfig();
      expect(config).toEqual({
        token: "explicit_token",
        source: "flag",
      });
    });

    it("should return correct auth config with environment token", async () => {
      process.env.HF_TOKEN = "env_token";

      const config = await testAuthManager.getAuthConfig();
      expect(config).toEqual({
        token: "env_token",
        source: "env",
      });
    });

    it("should return correct auth config with no token", async () => {
      const config = await testAuthManager.getAuthConfig();
      expect(config).toEqual({
        token: undefined,
        source: "config",
      });
    });
  });

  describe("Token Management Integration", () => {
    it("should clear token and source", () => {
      testAuthManager.setToken("test_token");
      expect(testAuthManager.getTokenSource()).toBe("flag");

      testAuthManager.clearToken();
      expect(testAuthManager.getTokenSource()).toBeNull();
    });

    it("should handle token clearing after environment token", async () => {
      process.env.HF_TOKEN = "env_token";

      // Get token to cache it
      testAuthManager.getToken();
      expect(testAuthManager.getTokenSource()).toBe("env");

      // Clear should reset everything
      testAuthManager.clearToken();
      expect(testAuthManager.getTokenSource()).toBeNull();

      // Next call should get from environment again
      const token = testAuthManager.getToken();
      expect(token).toBe("env_token");
      expect(testAuthManager.getTokenSource()).toBe("env");
    });
  });

  describe("Error Scenarios Integration", () => {
    it("should handle malformed tokens gracefully", async () => {
      mockWhoAmI.mockRejectedValue(new Error("Malformed token"));

      const isValid = await testAuthManager.validateToken("malformed_token");
      expect(isValid).toBe(false);
    });

    it("should handle expired tokens", async () => {
      mockWhoAmI.mockRejectedValue(new Error("Token expired"));

      testAuthManager.setToken("expired_token");

      await expect(
        testAuthManager.validateAuthentication(true)
      ).rejects.toMatchObject({
        type: ErrorType.AUTHENTICATION_ERROR,
        message: expect.stringContaining("Invalid authentication token"),
      });
    });

    it("should handle API unavailability during validation", async () => {
      mockWhoAmI.mockRejectedValue(new Error("Service unavailable"));

      const isValid = await testAuthManager.validateToken("any_token");
      expect(isValid).toBe(false);
    });

    it("should provide helpful error messages for common scenarios", async () => {
      // Test missing token scenario
      await expect(
        testAuthManager.validateAuthentication(true)
      ).rejects.toMatchObject({
        type: ErrorType.AUTHENTICATION_ERROR,
        suggestions: expect.arrayContaining([
          expect.stringContaining("export HF_TOKEN"),
          expect.stringContaining("--token flag"),
          expect.stringContaining("huggingface.co/settings/tokens"),
        ]),
      });
    });
  });

  describe("Singleton Auth Manager Integration", () => {
    it("should maintain state across imports", async () => {
      // Set token on singleton
      authManager.setToken("singleton_token");

      // Get token should return the same value
      const token = authManager.getToken();
      expect(token).toBe("singleton_token");
      expect(authManager.getTokenSource()).toBe("flag");
    });

    it("should clear singleton state", () => {
      authManager.setToken("test_token");
      authManager.clearToken();

      expect(authManager.getTokenSource()).toBeNull();
    });
  });

  describe("Real-world Authentication Scenarios", () => {
    it("should handle typical CLI workflow - upload with token flag", async () => {
      mockWhoAmI.mockResolvedValue(mockUserResponse);

      // Simulate CLI setting token from flag
      testAuthManager.setToken("cli_provided_token");

      // Validate for upload (requires auth)
      const token = await testAuthManager.validateAuthentication(true);
      expect(token).toBe("cli_provided_token");
    });

    it("should handle typical CLI workflow - download without token", async () => {
      // Simulate download from public repo (no auth required)
      const token = await testAuthManager.validateAuthentication(false);
      expect(token).toBeNull();
    });

    it("should handle typical CLI workflow - environment token", async () => {
      mockWhoAmI.mockResolvedValue(mockUserResponse);

      // Simulate environment token
      process.env.HF_TOKEN = "env_provided_token";

      // Validate for upload (requires auth)
      const token = await testAuthManager.validateAuthentication(true);
      expect(token).toBe("env_provided_token");
    });

    it("should handle token precedence in real workflow", async () => {
      mockWhoAmI.mockResolvedValue(mockUserResponse);

      // Set environment token
      process.env.HF_TOKEN = "env_token";

      // CLI provides explicit token (should take precedence)
      testAuthManager.setToken("cli_token");

      const token = await testAuthManager.validateAuthentication(true);
      expect(token).toBe("cli_token");
      expect(testAuthManager.getTokenSource()).toBe("flag");
    });
  });
});
