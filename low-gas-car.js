import { chromium } from "playwright";
import { closeAllModals, getAuthPaths } from "./lib/common.js";
import fs from "fs";
import { URL } from 'url';

export const runLowGasCarFlow = async ({
  chromiumModule = chromium,
  logger = console,
  exit = process.exit,
  argv = process.argv,
  env = process.env,
  existsSync = fs.existsSync,
  authPaths = getAuthPaths(),
} = {}) => {
  const selectors = {
    searchTab: 'text="駅名から探す"',
    stationMapLink: '#goStationMap',
    carIcons: 'a:has(img[src*="/dynamic/images/TP.gif"])',
    reserveButton: 'a[href*="/view/sp/reserve/input.jsp?scd="]:has(img[src*="/dynamic/sp/images/stationMap_bt002.gif"][alt="予約"])',
    timetable: '#timetableListview',
    stationName: '#stationNm',
    carHeaders: '#timetableListview > li[data-role="list-divider"]',
  };
  const stationName = env.STATION;
  if (!stationName) {
    return exit(1);
  }

  const { authPath } = authPaths;
  if (!existsSync(authPath)) {
    return exit(1);
  }

  const headlessMode = !argv.includes('--headed');
  const timeouts = {
    short: 2000,
    medium: 3000,
    long: 7000,
  };
  const lowGasCars = [];
  const uniqueResults = (items) => (
    [...new Map(items.map(item => [JSON.stringify(item), item])).values()]
  );
  let browser;
  let page;
  try {
    browser = await chromiumModule.launch({ headless: headlessMode });
    const context = await browser.newContext({
      storageState: authPath,
      userAgent: 'iPhone Safari/6.0, Safari/605.1.15',
    });
    page = await context.newPage();

    const url = "https://share.timescar.jp/view/sp/station/search.jsp";

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator(selectors.searchTab).click();
    await page.fill('#eki', stationName);
    await page.click('#doEkiSearch');
    await page.waitForLoadState('domcontentloaded');
    logger.error('Search results loaded.');

    logger.error('Clicking the first station link...');
    await page.locator(selectors.stationMapLink).first().click();
    await page.waitForLoadState('domcontentloaded');
    logger.error('Station map loaded.');

    const carIcons = page.locator(selectors.carIcons);
    await carIcons.first().waitFor({ state: 'visible', timeout: timeouts.long });
    const count = await carIcons.count();
    logger.error(`${count} station icons found.`);

    for (let i = 0; i < count; i++) {
      const currentMapUrl = page.url();
      logger.error(`\nChecking station icon ${i + 1}/${count}...`);

      try {
        await carIcons.nth(i).click({ timeout: timeouts.medium });
        await closeAllModals(page, logger);

        await page.waitForSelector(selectors.reserveButton, { state: 'visible', timeout: timeouts.medium });
        
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: timeouts.medium }),
          page.click(selectors.reserveButton),
        ]);
        await closeAllModals(page, logger);
        
        await page.locator(selectors.timetable).waitFor({ state: 'visible', timeout: timeouts.medium });
        const stationNameText = await page.locator(selectors.stationName).first().innerText();
        logger.error(`  -> Station name found: "${stationNameText}"`);
        const carHeaders = page.locator(selectors.carHeaders);
        const numCars = await carHeaders.count();
        logger.error(`  -> Found ${numCars} car headers to check.`);

        if (numCars > 0) {
          for (let j = 0; j < numCars; j++) {
            const header = carHeaders.nth(j);
            const carName = await header.innerText();

            const fuelLocator = header.locator('xpath=./following-sibling::li[1]//td[contains(@class, "carinfo-fuel")]');
            
            try {
              const fuelStatus = await fuelLocator.innerText({ timeout: timeouts.short });

              if (fuelStatus.includes('△')) {
                logger.error(`      - SUCCESS: Low fuel detected.`);
                const currentUrl = new URL(page.url());
                const stationCode = currentUrl.searchParams.get('scd');
                const result = { stationName: stationNameText.trim(), stationCode, carName: carName.trim() };
                logger.error(`      - Storing result: station-name:${result.stationName}, station-id:${result.stationCode}, car:${result.carName}`);
                lowGasCars.push(result);
              } else {
                logger.error(`      - Fuel status is OK.`);
              }
            } catch (e) {
              logger.warn(`      - WARN: Could not determine fuel status for "${carName}". Reason: ${e.message.split('\n')[0]}`);
            }
          }
        } else {
          logger.error('  -> No car headers found on the page.');
        }

      } catch (error) {
        logger.warn(`  Station icon ${i + 1} is not reservable or has an issue. Skipping. `);
      } finally {
        if (page.url() !== currentMapUrl) {
          logger.error('  Returning to map to continue...');
          await page.goto(currentMapUrl, { waitUntil: 'domcontentloaded', timeout: timeouts.medium });
        }
        await closeAllModals(page, logger);
      }
    }

    logger.log(JSON.stringify({ lowGasCars: uniqueResults(lowGasCars) }));

  } catch (error) {
    logger.error("An error occurred:", error);
    if(page) await page.screenshot({ path: "debug_low-gas-error.png" });
    logger.error('Screenshot saved to debug_low-gas-error.png');
  } finally {
    if (browser) {
      await browser.close();
      logger.error("Browser closed.");
    }
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    await runLowGasCarFlow();
  })();
}
