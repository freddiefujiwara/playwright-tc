import { describe, it, expect, vi } from 'vitest';
import { closeAllModals, getAuthPaths } from '../../lib/common.js';

describe('getAuthPaths (lib)', () => {
  it('should return default paths', () => {
    const homedir = () => '/home/test';
    const join = (...args) => args.join('/');
    const { authDir, authPath } = getAuthPaths({ homedir, join, env: {} });
    expect(authDir).toBe('/home/test/.config/playwright-tc');
    expect(authPath).toBe('/home/test/.config/playwright-tc/auth.json');
  });

  it('should respect environment overrides', () => {
    const homedir = () => '/home/test';
    const join = (...args) => args.join('/');
    const env = {
      PLAYWRIGHT_TC_AUTH_DIR: '/custom/dir',
      PLAYWRIGHT_TC_AUTH_PATH: '/custom/path/custom.json',
    };
    const { authDir, authPath } = getAuthPaths({ homedir, join, env });
    expect(authDir).toBe('/custom/dir');
    expect(authPath).toBe('/custom/path/custom.json');
  });
});

describe('closeAllModals (lib)', () => {
  it('should close a modal and stop when none remain', async () => {
    const logger = { error: vi.fn() };
    const closeButton = { click: vi.fn().mockResolvedValue(null) };
    const modal = {
      waitFor: vi.fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('timeout')),
      locator: vi.fn(() => closeButton),
    };
    const page = {
      locator: vi.fn(() => ({ first: vi.fn(() => modal) })),
      waitForTimeout: vi.fn().mockResolvedValue(null),
    };

    await closeAllModals(page, logger);

    expect(closeButton.click).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Modal closed.');
    expect(logger.error).toHaveBeenCalledWith('No more modals found.');
  });
});
