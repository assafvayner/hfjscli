/**
 * Unit tests for progress indicator system
 */

import {
  ProgressIndicator,
  StatusMessages,
  createProgressCallback,
  withProgress,
} from "../../src/utils/progress";
import { Logger } from "../../src/utils/logger";

// Mock Logger
jest.mock("../../src/utils/logger", () => ({
  Logger: {
    startProgress: jest.fn(),
    updateProgress: jest.fn(),
    succeedProgress: jest.fn(),
    failProgress: jest.fn(),
    stopProgress: jest.fn(),
    verbose: jest.fn(),
    isVerbose: jest.fn().mockReturnValue(false),
  },
}));

// Mock console methods
const mockConsoleLog = jest.spyOn(console, "log").mockImplementation();

describe("ProgressIndicator", () => {
  let progressIndicator: ProgressIndicator;

  beforeEach(() => {
    jest.clearAllMocks();
    progressIndicator = new ProgressIndicator(
      "test-id",
      "Uploading",
      "test.txt"
    );
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
  });

  describe("constructor and basic functionality", () => {
    it("should create progress indicator with correct properties", () => {
      expect(progressIndicator).toBeInstanceOf(ProgressIndicator);
    });

    it("should start progress indicator", () => {
      progressIndicator.start();

      expect(Logger.startProgress).toHaveBeenCalledWith(
        "test-id",
        "Uploading test.txt..."
      );
    });

    it("should stop progress indicator", () => {
      progressIndicator.stop();

      expect(Logger.stopProgress).toHaveBeenCalledWith("test-id");
    });

    it("should succeed progress indicator", () => {
      progressIndicator.succeed("Custom success message");

      expect(Logger.succeedProgress).toHaveBeenCalledWith(
        "test-id",
        "Custom success message"
      );
    });

    it("should fail progress indicator", () => {
      progressIndicator.fail("Custom failure message");

      expect(Logger.failProgress).toHaveBeenCalledWith(
        "test-id",
        "Custom failure message"
      );
    });
  });

  describe("progress updates", () => {
    it("should update progress with percentage and sizes", () => {
      const progress = {
        loaded: 512000, // 500 KB
        total: 1048576, // 1 MB
        percentage: 48.8,
      };

      progressIndicator.update(progress);

      expect(Logger.updateProgress).toHaveBeenCalledWith(
        "test-id",
        expect.stringContaining("Uploading test.txt - 49% (500.0 KB/1.0 MB)")
      );
    });

    it("should calculate and display speed and ETA", (done) => {
      // First update to establish baseline
      progressIndicator.update({
        loaded: 0,
        total: 1000000,
        percentage: 0,
      });

      // Second update after a delay to calculate speed
      setTimeout(() => {
        progressIndicator.update({
          loaded: 500000,
          total: 1000000,
          percentage: 50,
        });

        expect(Logger.updateProgress).toHaveBeenLastCalledWith(
          "test-id",
          expect.stringMatching(
            /Uploading test\.txt - 50% \(488\.3 KB\/976\.6 KB\) - .* - ETA: .*/
          )
        );
        done();
      }, 100);
    });

    it("should handle zero speed gracefully", () => {
      const progress = {
        loaded: 1000,
        total: 2000,
        percentage: 50,
      };

      // Update twice with same values (zero speed)
      progressIndicator.update(progress);
      progressIndicator.update(progress);

      expect(Logger.updateProgress).toHaveBeenCalledWith(
        "test-id",
        expect.stringContaining("Uploading test.txt - 50%")
      );
    });
  });

  describe("formatting utilities", () => {
    it("should format bytes correctly", () => {
      const testCases = [
        { bytes: 512, expected: "512.0 B" },
        { bytes: 1536, expected: "1.5 KB" },
        { bytes: 1572864, expected: "1.5 MB" },
        { bytes: 1610612736, expected: "1.5 GB" },
      ];

      testCases.forEach(({ bytes, expected }) => {
        progressIndicator.update({
          loaded: bytes,
          total: bytes * 2,
          percentage: 50,
        });

        expect(Logger.updateProgress).toHaveBeenCalledWith(
          "test-id",
          expect.stringContaining(expected)
        );
      });
    });

    it("should format duration correctly", () => {
      // Test by checking the succeed message which includes duration
      const startTime = Date.now();

      // Mock Date.now to control timing
      const originalDateNow = Date.now;
      Date.now = jest
        .fn()
        .mockReturnValueOnce(startTime) // Constructor call
        .mockReturnValueOnce(startTime + 1500); // Succeed call

      const indicator = new ProgressIndicator(
        "test-duration",
        "Testing",
        "file.txt"
      );
      indicator.succeed();

      expect(Logger.succeedProgress).toHaveBeenCalledWith(
        "test-duration",
        expect.stringContaining("(1.5s)")
      );

      // Restore Date.now
      Date.now = originalDateNow;
    });
  });
});

describe("StatusMessages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should display operation start message", () => {
    StatusMessages.startOperation("upload", "test.txt");

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("🚀 Starting upload for test.txt")
    );
  });

  it("should display validation messages", () => {
    StatusMessages.validating("file path");

    expect(Logger.verbose).toHaveBeenCalledWith("🔍 Validating file path...");
  });

  it("should display authentication message", () => {
    StatusMessages.authenticating();

    expect(Logger.verbose).toHaveBeenCalledWith(
      "🔐 Checking authentication..."
    );
  });

  it("should display repository validation message", () => {
    StatusMessages.validatingRepository("user/repo", "model");

    expect(Logger.verbose).toHaveBeenCalledWith(
      "📋 Validating repository user/repo (model)..."
    );
  });

  it("should display file validation message", () => {
    StatusMessages.validatingFile("/path/to/file.txt");

    expect(Logger.verbose).toHaveBeenCalledWith(
      "📁 Validating file /path/to/file.txt..."
    );
  });

  it("should display success message with details", () => {
    const details = {
      File: "test.txt",
      Size: "1.2 MB",
      Repository: "user/repo",
    };

    StatusMessages.success("Upload", details);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("✅ Upload successful!")
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Details:")
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("File: test.txt")
    );
  });

  it("should display warning message with suggestion", () => {
    StatusMessages.warning("File is large", "Consider compressing the file");

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("⚠️  File is large")
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("💡 Consider compressing the file")
    );
  });

  it("should display info message with custom icon", () => {
    StatusMessages.info("Processing complete", "🎉");

    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining("🎉 Processing complete")
    );
  });

  it("should display configuration summary in verbose mode", () => {
    (Logger.isVerbose as jest.Mock).mockReturnValue(true);

    const config = {
      repository: "user/repo",
      type: "model",
      token: "***",
    };

    StatusMessages.configSummary(config);

    expect(Logger.verbose).toHaveBeenCalledWith("Configuration Summary:");
    expect(Logger.verbose).toHaveBeenCalledWith("  repository: user/repo");
    expect(Logger.verbose).toHaveBeenCalledWith("  type: model");
    expect(Logger.verbose).toHaveBeenCalledWith("  token: ***");
  });

  it("should not display configuration summary when not in verbose mode", () => {
    (Logger.isVerbose as jest.Mock).mockReturnValue(false);

    const config = { test: "value" };
    StatusMessages.configSummary(config);

    expect(Logger.verbose).not.toHaveBeenCalled();
  });
});

describe("createProgressCallback", () => {
  it("should create a progress callback that updates the indicator", () => {
    const indicator = new ProgressIndicator("test", "Testing", "file.txt");
    const callback = createProgressCallback(indicator);

    const progress = {
      loaded: 500,
      total: 1000,
      percentage: 50,
    };

    callback(progress);

    expect(Logger.updateProgress).toHaveBeenCalledWith(
      "test",
      expect.stringContaining("Testing file.txt - 50%")
    );
  });
});

describe("withProgress", () => {
  it("should manage progress indicator for successful operations", async () => {
    const mockTask = jest.fn().mockResolvedValue("success");

    const result = await withProgress("Testing", "file.txt", mockTask);

    expect(result).toBe("success");
    expect(Logger.startProgress).toHaveBeenCalled();
    expect(Logger.succeedProgress).toHaveBeenCalled();
    expect(mockTask).toHaveBeenCalledWith(expect.any(Function));
  });

  it("should manage progress indicator for failed operations", async () => {
    jest.clearAllMocks(); // Clear mocks before this test

    const mockTask = jest.fn().mockRejectedValue(new Error("Task failed"));

    await expect(withProgress("Testing", "file.txt", mockTask)).rejects.toThrow(
      "Task failed"
    );

    expect(Logger.startProgress).toHaveBeenCalled();
    expect(Logger.failProgress).toHaveBeenCalled();
    expect(Logger.succeedProgress).not.toHaveBeenCalled();
  });

  it("should provide progress callback to task", async () => {
    let capturedCallback: any;

    const mockTask = jest.fn().mockImplementation((callback) => {
      capturedCallback = callback;
      return Promise.resolve("success");
    });

    await withProgress("Testing", "file.txt", mockTask);

    expect(capturedCallback).toBeInstanceOf(Function);

    // Test that the callback works
    capturedCallback({
      loaded: 100,
      total: 200,
      percentage: 50,
    });

    expect(Logger.updateProgress).toHaveBeenCalled();
  });
});
