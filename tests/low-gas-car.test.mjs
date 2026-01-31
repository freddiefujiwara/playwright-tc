import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/common.js', () => ({
  closeAllModals: vi.fn().mockResolvedValue(null),
  getAuthPaths: vi.fn(() => ({ authDir: '/mock/authDir', authPath: '/mock/authDir/auth.json' })),
}));

import { runLowGasCarFlow } from '../low-gas-car.js';

const createMockPage = ({
  fuelStatus = '△',
  fuelThrows = false,
  carHeadersCount = 1,
  carIconsCount = 1,
  stationName = 'Station A',
  carName = 'Car A',
  url = 'https://example.com/?scd=SC123',
  urlSequence = null,
  gotoRejects = false,
  carIconClickRejects = false,
} = {}) => {
  const fuelLocator = {
    innerText: fuelThrows
      ? vi.fn().mockRejectedValue(new Error('fuel read failed'))
      : vi.fn().mockResolvedValue(fuelStatus),
  };
  const header = {
    innerText: vi.fn().mockResolvedValue(carName),
    locator: vi.fn(() => fuelLocator),
  };
  const carHeaders = {
    count: vi.fn().mockResolvedValue(carHeadersCount),
    nth: vi.fn(() => header),
  };
  const carIcons = {
    count: vi.fn().mockResolvedValue(carIconsCount),
    first: vi.fn(() => ({ waitFor: vi.fn().mockResolvedValue(null) })),
    nth: vi.fn(() => ({
      click: carIconClickRejects
        ? vi.fn().mockRejectedValue(new Error('icon click failed'))
        : vi.fn().mockResolvedValue(null),
    })),
  };
  const stationNameLocator = {
    first: vi.fn(() => ({ innerText: vi.fn().mockResolvedValue(stationName) })),
  };
  const stationMapLocator = {
    first: vi.fn(() => ({ click: vi.fn().mockResolvedValue(null) })),
  };
  const timetableLocator = {
    waitFor: vi.fn().mockResolvedValue(null),
  };
  const findStationLocator = {
    click: vi.fn().mockResolvedValue(null),
  };

  const urlCalls = Array.isArray(urlSequence) ? [...urlSequence] : null;

  return {
    goto: gotoRejects ? vi.fn().mockRejectedValue(new Error('goto failed')) : vi.fn().mockResolvedValue(null),
    waitForLoadState: vi.fn().mockResolvedValue(null),
    waitForNavigation: vi.fn().mockResolvedValue(null),
    waitForSelector: vi.fn().mockResolvedValue(null),
    click: vi.fn().mockResolvedValue(null),
    fill: vi.fn().mockResolvedValue(null),
    screenshot: vi.fn().mockResolvedValue(null),
    url: vi.fn(() => {
      if (!urlCalls || urlCalls.length === 0) {
        return url;
      }
      return urlCalls.shift();
    }),
    locator: vi.fn((selector) => {
      if (selector === 'text="駅名から探す"') {
        return findStationLocator;
      }
      if (selector === '#goStationMap') {
        return stationMapLocator;
      }
      if (selector === 'a:has(img[src*="/dynamic/images/TP.gif"])') {
        return carIcons;
      }
      if (selector === '#timetableListview') {
        return timetableLocator;
      }
      if (selector === '#stationNm') {
        return stationNameLocator;
      }
      if (selector === '#timetableListview > li[data-role="list-divider"]') {
        return carHeaders;
      }
      return { click: vi.fn().mockResolvedValue(null) };
    }),
  };
};

const createChromiumMocks = (page) => {
  const context = { newPage: vi.fn().mockResolvedValue(page) };
  const browser = { newContext: vi.fn().mockResolvedValue(context), close: vi.fn().mockResolvedValue(null) };
  const chromiumModule = { launch: vi.fn().mockResolvedValue(browser) };
  return { chromiumModule, browser };
};

describe('runLowGasCarFlow', () => {
  const baseEnv = { STATION: 'Test Station' };
  const mockExit = vi.fn();
  const mockExistsSync = vi.fn().mockReturnValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should exit if STATION is missing', async () => {
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const { chromiumModule } = createChromiumMocks(createMockPage());
    const { STATION, ...env } = baseEnv;

    await runLowGasCarFlow({
      chromiumModule,
      logger,
      exit: mockExit,
      env,
      existsSync: mockExistsSync,
    });

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should exit if auth file is missing', async () => {
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const { chromiumModule } = createChromiumMocks(createMockPage());
    mockExistsSync.mockReturnValueOnce(false);

    await runLowGasCarFlow({
      chromiumModule,
      logger,
      exit: mockExit,
      env: baseEnv,
      existsSync: mockExistsSync,
    });

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should report low gas cars in JSON output', async () => {
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const page = createMockPage();
    const { chromiumModule, browser } = createChromiumMocks(page);

    await runLowGasCarFlow({
      chromiumModule,
      logger,
      exit: mockExit,
      env: baseEnv,
      existsSync: mockExistsSync,
      argv: [],
    });

    const output = logger.log.mock.calls[0]?.[0];
    const parsed = JSON.parse(output);
    expect(parsed.lowGasCars).toHaveLength(1);
    expect(parsed.lowGasCars[0]).toEqual({
      stationName: 'Station A',
      stationCode: 'SC123',
      carName: 'Car A',
    });
    expect(browser.close).toHaveBeenCalled();
  });

  it('should emit empty report when no low gas cars are found', async () => {
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const page = createMockPage({ fuelStatus: '◎' });
    const { chromiumModule } = createChromiumMocks(page);

    await runLowGasCarFlow({
      chromiumModule,
      logger,
      exit: mockExit,
      env: baseEnv,
      existsSync: mockExistsSync,
      argv: [],
    });

    const output = logger.log.mock.calls[0]?.[0];
    const parsed = JSON.parse(output);
    expect(parsed.lowGasCars).toHaveLength(0);
  });

  it('should handle errors during navigation', async () => {
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const page = createMockPage({ gotoRejects: true });
    const { chromiumModule, browser } = createChromiumMocks(page);

    await runLowGasCarFlow({
      chromiumModule,
      logger,
      exit: mockExit,
      env: baseEnv,
      existsSync: mockExistsSync,
      argv: [],
    });

    expect(logger.error).toHaveBeenCalledWith('An error occurred:', expect.any(Error));
    expect(page.screenshot).toHaveBeenCalledWith({ path: 'debug_low-gas-error.png' });
    expect(browser.close).toHaveBeenCalled();
  });

  it('should warn when fuel status cannot be determined', async () => {
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const page = createMockPage({ fuelThrows: true });
    const { chromiumModule } = createChromiumMocks(page);

    await runLowGasCarFlow({
      chromiumModule,
      logger,
      exit: mockExit,
      env: baseEnv,
      existsSync: mockExistsSync,
      argv: [],
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not determine fuel status for')
    );
  });

  it('should warn and continue when a station icon click fails', async () => {
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const page = createMockPage({ carIconClickRejects: true });
    const { chromiumModule } = createChromiumMocks(page);

    await runLowGasCarFlow({
      chromiumModule,
      logger,
      exit: mockExit,
      env: baseEnv,
      existsSync: mockExistsSync,
      argv: [],
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Station icon 1 is not reservable or has an issue.')
    );
  });

  it('should return to map when navigation changes the URL', async () => {
    const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const mapUrl = 'https://example.com/map';
    const detailUrl = 'https://example.com/detail';
    const page = createMockPage({
      carHeadersCount: 0,
      urlSequence: [mapUrl, detailUrl],
    });
    const { chromiumModule } = createChromiumMocks(page);

    await runLowGasCarFlow({
      chromiumModule,
      logger,
      exit: mockExit,
      env: baseEnv,
      existsSync: mockExistsSync,
      argv: [],
    });

    expect(page.goto).toHaveBeenLastCalledWith(mapUrl, { waitUntil: 'domcontentloaded', timeout: 3000 });
  });
});
