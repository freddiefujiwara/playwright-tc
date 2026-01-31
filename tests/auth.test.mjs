import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Node.js built-in modules at the top level
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false), // Default to not existing for initial tests
}));

vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

// Now import the module under test
import { getAuthPaths, persistAuthState, runAuthFlow } from '../auth.js';

describe('getAuthPaths', () => {
  it('should return default auth paths', () => {
    const homedir = vi.fn(() => '/home/test');
    const join = vi.fn((...args) => args.join('/'));
    const env = {};
    const { authDir, authPath } = getAuthPaths({ homedir, join, env });
    expect(authDir).toBe('/home/test/.config/playwright-tc');
    expect(authPath).toBe('/home/test/.config/playwright-tc/auth.json');
  });

  it('should respect PLAYWRIGHT_TC_AUTH_DIR environment variable', () => {
    const homedir = vi.fn(() => '/home/test');
    const join = vi.fn((...args) => args.join('/'));
    const env = { PLAYWRIGHT_TC_AUTH_DIR: '/custom/dir' };
    const { authDir, authPath } = getAuthPaths({ homedir, join, env });
    expect(authDir).toBe('/custom/dir');
    expect(authPath).toBe('/custom/dir/auth.json');
  });

  it('should respect PLAYWRIGHT_TC_AUTH_PATH environment variable', () => {
    const homedir = vi.fn(() => '/home/test');
    const join = vi.fn((...args) => args.join('/'));
    const env = { PLAYWRIGHT_TC_AUTH_PATH: '/custom/path/custom.json' };
    const { authDir, authPath } = getAuthPaths({ homedir, join, env });
    expect(authDir).toBe('/home/test/.config/playwright-tc'); // authDir should still be default
    expect(authPath).toBe('/custom/path/custom.json');
  });
});

describe('persistAuthState', () => {
  it('should successfully persist auth state', async () => {
    const context = { storageState: vi.fn(() => Promise.resolve()) };
    const fsModule = { mkdirSync: vi.fn() };
    const logger = { log: vi.fn(), error: vi.fn() };
    const authDir = '/tmp/authDir';
    const authPath = '/tmp/authDir/auth.json';

    await persistAuthState({ context, authDir, authPath, fsModule, logger });

    expect(fsModule.mkdirSync).toHaveBeenCalledWith(authDir, { recursive: true });
    expect(context.storageState).toHaveBeenCalledWith({ path: authPath });
    expect(logger.log).toHaveBeenCalledWith(`Saved authentication data: ${authPath}`);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should log an error if persistence fails', async () => {
    const error = new Error('Failed to save');
    const context = { storageState: vi.fn(() => Promise.reject(error)) };
    const fsModule = { mkdirSync: vi.fn() };
    const logger = { log: vi.fn(), error: vi.fn() };
    const authDir = '/tmp/authDir';
    const authPath = '/tmp/authDir/auth.json';

    await persistAuthState({ context, authDir, authPath, fsModule, logger });

    expect(fsModule.mkdirSync).toHaveBeenCalledWith(authDir, { recursive: true });
    expect(context.storageState).toHaveBeenCalledWith({ path: authPath });
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Failed to save auth.json:', error);
  });
});

describe('runAuthFlow', () => {
  const mockClick = vi.fn(() => Promise.resolve());
  const mockLocatorInner = vi.fn(() => ({
    click: mockClick,
  }));
  const mockWaitFor = vi.fn(() => Promise.resolve());
  const mockFirst = vi.fn(() => ({
    waitFor: mockWaitFor,
    locator: mockLocatorInner,
  }));
  const mockLocator = vi.fn(() => ({
    first: mockFirst,
  }));

  const mockPage = {
    goto: vi.fn(() => Promise.resolve()),
    fill: vi.fn(() => Promise.resolve()),
    click: vi.fn(() => Promise.resolve()),
    waitForURL: vi.fn(() => Promise.resolve()),
    locator: mockLocator,
    waitForTimeout: vi.fn(() => Promise.resolve()), // Add mock for waitForTimeout
  };

  const mockContext = {
    newPage: vi.fn(() => Promise.resolve(mockPage)),
    storageState: vi.fn(() => Promise.resolve()),
  };

  const mockBrowser = {
    newContext: vi.fn(() => Promise.resolve(mockContext)),
    close: vi.fn(() => Promise.resolve()),
  };

  const mockChromium = {
    launch: vi.fn(() => Promise.resolve(mockBrowser)),
  };

  const mockLogger = { log: vi.fn(), error: vi.fn() };
  const mockExit = vi.fn(() => Promise.resolve()); // Mock exit to resolve
  const mockPersistFn = vi.fn(() => Promise.resolve());
  const mockAuthPaths = { authDir: '/mock/authDir', authPath: '/mock/authDir/auth.json' };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations for dynamic behavior if needed
    mockWaitFor.mockImplementation(() => Promise.resolve());
    mockClick.mockImplementation(() => Promise.resolve());
    mockLocatorInner.mockImplementation(() => ({ click: mockClick }));
    mockFirst.mockImplementation(() => ({ waitFor: mockWaitFor, locator: mockLocatorInner }));
    mockLocator.mockImplementation(() => ({ first: mockFirst }));
  });

  it('should run the full authentication flow and persist state', async () => {
    const env = {
      TIMESCAR_CARD_NO: '1234567890',
      TIMESCAR_PASSWORD: 'password123',
    };

    await runAuthFlow({
      chromiumModule: mockChromium,
      logger: mockLogger,
      exit: mockExit,
      authPaths: mockAuthPaths,
      persistFn: mockPersistFn,
      env,
    });

    expect(mockChromium.launch).toHaveBeenCalledWith({ headless: true });
    expect(mockBrowser.newContext).toHaveBeenCalledWith({ userAgent: 'iPhone Safari/605.1.15' });
    expect(mockContext.newPage).toHaveBeenCalled();
    expect(mockPage.goto).toHaveBeenCalledWith('https://share.timescar.jp/view/sp/member/mypage.jsp', { waitUntil: 'domcontentloaded' });
    expect(mockLogger.log).toHaveBeenCalledWith('Successfully logged in.');
    
    // Check total calls to ensure no unexpected navigation
    expect(mockPage.goto).toHaveBeenCalledTimes(1);
    
    // Modal closing logic
    expect(mockLocator).toHaveBeenCalledWith('div.info_message:visible');
    expect(mockFirst).toHaveBeenCalled();
    expect(mockWaitFor).toHaveBeenCalledWith({ timeout: 3000 });
    expect(mockLocatorInner).toHaveBeenCalledWith('a[data-role="button"]');
    expect(mockClick).toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledWith('Modal closed.');
    expect(mockPage.waitForTimeout).toHaveBeenCalledWith(1000);

    expect(mockPersistFn).toHaveBeenCalledWith({
      context: mockContext,
      authDir: mockAuthPaths.authDir,
      authPath: mockAuthPaths.authPath,
      logger: mockLogger,
    });
    expect(mockBrowser.close).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should throw an error if TIMESCAR_CARD_NO is not set', async () => {
    const env = { TIMESCAR_PASSWORD: 'password123' };
    await expect(runAuthFlow({
      chromiumModule: mockChromium,
      logger: mockLogger,
      exit: mockExit, // Still need to pass for finally block, but not directly tested in this path
      authPaths: mockAuthPaths,
      persistFn: mockPersistFn,
      env,
    })).rejects.toThrow('TIMESCAR_CARD_NO environment variable is missing.');
    expect(mockLogger.error).toHaveBeenCalledWith('Please set TIMESCAR_CARD_NO environment variable.');
    // No further Playwright calls should be made
    expect(mockChromium.launch).not.toHaveBeenCalled();
    expect(mockPersistFn).not.toHaveBeenCalled();
  });

  it('should throw an error if TIMESCAR_PASSWORD is not set', async () => {
    const env = { TIMESCAR_CARD_NO: '1234567890' };
    await expect(runAuthFlow({
      chromiumModule: mockChromium,
      logger: mockLogger,
      exit: mockExit, // Still need to pass for finally block
      authPaths: mockAuthPaths,
      persistFn: mockPersistFn,
      env,
    })).rejects.toThrow('TIMESCAR_PASSWORD environment variable is missing.');
    expect(mockLogger.error).toHaveBeenCalledWith('Please set TIMESCAR_PASSWORD environment variable.');
    // No further Playwright calls should be made
    expect(mockChromium.launch).not.toHaveBeenCalled();
    expect(mockPersistFn).not.toHaveBeenCalled();
  });

  it('should handle no modals being found', async () => {
    // Mock `waitFor` to throw an error immediately, simulating no modal found
    mockWaitFor.mockImplementationOnce(() => Promise.reject(new Error('Timeout')));

    const env = {
      TIMESCAR_CARD_NO: '1234567890',
      TIMESCAR_PASSWORD: 'password123',
    };

    await runAuthFlow({
      chromiumModule: mockChromium,
      logger: mockLogger,
      exit: mockExit,
      authPaths: mockAuthPaths,
      persistFn: mockPersistFn,
      env,
    });

    expect(mockLogger.log).toHaveBeenCalledWith('No more modals found.');
    expect(mockPersistFn).toHaveBeenCalled(); // Should still try to persist state
    expect(mockBrowser.close).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
    // Ensure click was NOT called if no modal found
    expect(mockClick).not.toHaveBeenCalled();
  });

  it('should handle multiple modals being found and closed', async () => {
    let modalCount = 2; // Simulate 2 modals
    mockWaitFor.mockImplementation(() => {
      if (modalCount > 0) {
        modalCount--;
        return Promise.resolve();
      }
      return Promise.reject(new Error('Timeout')); // No more modals
    });

    const env = {
      TIMESCAR_CARD_NO: '1234567890',
      TIMESCAR_PASSWORD: 'password123',
    };

    await runAuthFlow({
      chromiumModule: mockChromium,
      logger: mockLogger,
      exit: mockExit,
      authPaths: mockAuthPaths,
      persistFn: mockPersistFn,
      env,
    });

    expect(mockLogger.log).toHaveBeenCalledWith('Modal closed.'); // Called for each modal
    expect(mockLogger.log).toHaveBeenCalledWith('No more modals found.');
    expect(mockClick).toHaveBeenCalledTimes(2);
    expect(mockPersistFn).toHaveBeenCalled();
    expect(mockBrowser.close).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should launch in headed mode when --headed flag is passed', async () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'auth.js', '--headed']; // Mock command-line arguments

    const env = {
      TIMESCAR_CARD_NO: '1234567890',
      TIMESCAR_PASSWORD: 'password123',
    };

    await runAuthFlow({
      chromiumModule: mockChromium,
      logger: mockLogger,
      exit: mockExit,
      authPaths: mockAuthPaths,
      persistFn: mockPersistFn,
      env,
    });

    expect(mockChromium.launch).toHaveBeenCalledWith({ headless: false });

    process.argv = originalArgv; // Restore original arguments
  });
});
