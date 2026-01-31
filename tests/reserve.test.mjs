import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runReservationFlow } from '../reserve.js';
import { getAuthPaths, closeAllModals } from '../lib/common.js';

// Mock Playwright modules
const mockClick = vi.fn(() => Promise.resolve());
// ... (rest of playwright mocks)
const mockPage = {
  goto: vi.fn().mockResolvedValue(null),
  selectOption: vi.fn().mockResolvedValue([]),
  click: mockClick,
  waitForLoadState: vi.fn().mockResolvedValue(null),
  waitForSelector: vi.fn().mockResolvedValue(null),
  evaluate: vi.fn((fn, selector) => {
    fn(selector);
    return Promise.resolve(null);
  }),
  screenshot: vi.fn().mockResolvedValue(null),
  waitForTimeout: vi.fn().mockResolvedValue(null),
  locator: vi.fn(() => ({
    click: mockClick,
    waitFor: vi.fn().mockResolvedValue(null),
    first: vi.fn(() => ({
      waitFor: vi.fn().mockResolvedValue(null),
      locator: vi.fn(() => ({ click: mockClick })),
    })),
  })),
  waitForFunction: vi.fn().mockResolvedValue(true),
  waitForNavigation: vi.fn().mockResolvedValue(null),
};
const mockContext = { newPage: vi.fn().mockResolvedValue(mockPage) };
const mockBrowser = {
  newContext: vi.fn().mockResolvedValue(mockContext),
  close: vi.fn().mockResolvedValue(null),
};
const mockChromium = { launch: vi.fn().mockResolvedValue(mockBrowser) };


describe('getAuthPaths', () => {
  it('should return default paths', () => {
    const homedir = () => '/home/test';
    const join = (...args) => args.join('/');
    const { authDir, authPath } = getAuthPaths({ homedir, join, env: {} });
    expect(authDir).toBe('/home/test/.config/playwright-tc');
    expect(authPath).toBe('/home/test/.config/playwright-tc/auth.json');
  });
});

describe('closeAllModals', () => {
  it('should stop when no visible modal is found', async () => {
    const logger = { error: vi.fn() };
    const modal = {
      waitFor: vi.fn().mockRejectedValue(new Error('timeout')),
      locator: vi.fn(() => ({ click: vi.fn() })),
    };
    const page = {
      locator: vi.fn(() => ({ first: vi.fn(() => modal) })),
      waitForTimeout: vi.fn(),
    };

    await closeAllModals(page, logger);

    expect(logger.error).toHaveBeenCalledWith('No more modals found.');
  });
});

describe('runReservationFlow', () => {
  const mockLogger = { log: vi.fn(), error: vi.fn() };
  const mockExit = vi.fn();
  const mockAuthPaths = { authDir: '/mock/authDir', authPath: '/mock/authDir/auth.json' };
  const mockExistsSync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    global.document = { querySelector: vi.fn() };
  });

  const baseEnv = {
    STATION_ID: 'TEST01',
    RESERVE_DATE: '2026-02-01',
    RESERVE_START: '08',
    RESERVE_END: '10',
  };

  it('should complete the reservation flow successfully', async () => {
    await runReservationFlow({
      chromiumModule: mockChromium,
      logger: mockLogger,
      exit: mockExit,
      authPaths: mockAuthPaths,
      env: baseEnv,
      existsSync: mockExistsSync,
    });
    expect(mockLogger.log).toHaveBeenCalledWith('Successfully completed reservation flow. "予約登録(受付)" page confirmed.');
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('should exit if auth file is not found', async () => {
    mockExistsSync.mockReturnValue(false);
    await runReservationFlow({
      logger: mockLogger,
      exit: mockExit,
      authPaths: mockAuthPaths,
      env: baseEnv,
      existsSync: mockExistsSync,
    });
    expect(mockLogger.error).toHaveBeenCalledWith(`Authentication file not found: ${mockAuthPaths.authPath}`);
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  // Add other tests for env vars etc.
  it('should exit if STATION_ID is missing', async () => {
    const { STATION_ID, ...env } = baseEnv;
    await runReservationFlow({ logger: mockLogger, exit: mockExit, env, existsSync: mockExistsSync });
    expect(mockLogger.error).toHaveBeenCalledWith('Please set STATION_ID environment variable.');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should exit if RESERVE_DATE is missing', async () => {
    const { RESERVE_DATE, ...env } = baseEnv;
    await runReservationFlow({ logger: mockLogger, exit: mockExit, env, existsSync: mockExistsSync });
    expect(mockLogger.error).toHaveBeenCalledWith("Please set RESERVE_DATE environment variable (e.g., '2026-01-31').");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should exit if RESERVE_START is missing', async () => {
    const { RESERVE_START, ...env } = baseEnv;
    await runReservationFlow({ logger: mockLogger, exit: mockExit, env, existsSync: mockExistsSync });
    expect(mockLogger.error).toHaveBeenCalledWith("Please set RESERVE_START environment variable (e.g., '19' or '08').");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should exit if RESERVE_END is missing', async () => {
    const { RESERVE_END, ...env } = baseEnv;
    await runReservationFlow({ logger: mockLogger, exit: mockExit, env, existsSync: mockExistsSync });
    expect(mockLogger.error).toHaveBeenCalledWith("Please set RESERVE_END environment variable (e.g., '21').");
    expect(mockExit).toHaveBeenCalledWith(1);
  });
  
  it('should handle errors during playwright operations', async () => {
    const error = new Error('Playwright failed');
    mockPage.goto.mockRejectedValue(error);
    await runReservationFlow({
      chromiumModule: mockChromium,
      logger: mockLogger,
      exit: mockExit,
      authPaths: mockAuthPaths,
      env: baseEnv,
      existsSync: mockExistsSync,
    });
    expect(mockLogger.error).toHaveBeenCalledWith('An error occurred:', error);
    expect(mockPage.screenshot).toHaveBeenCalledWith({ path: 'debug_reserve-error.png' });
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
