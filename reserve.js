import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";

export const getAuthPaths = ({
  homedir = os.homedir,
  join = path.join,
  env = process.env,
} = {}) => {
  const defaultAuthDir = join(homedir(), ".config", "playwright-tc");
  const authDir = env.PLAYWRIGHT_TC_AUTH_DIR ?? defaultAuthDir;
  return {
    authDir,
    authPath: env.PLAYWRIGHT_TC_AUTH_PATH ?? join(authDir, "auth.json"),
  };
};

export const closeAllModals = async (page, logger = console) => {
  logger.log('Checking for modals...');
  for (let i = 0; i < 10; i++) { // Limit attempts to avoid infinite loop
    try {
      // Find the first visible modal container. Wait up to 3 seconds.
      const modal = page.locator('div.info_message:visible').first();
      await modal.waitFor({ timeout: 3000 });

      // Find the primary action button within that modal and click it.
      const closeButton = modal.locator('a[data-role="button"]');
      await closeButton.click();

      logger.log('Modal closed.');
      await page.waitForTimeout(1000); // Wait for transition
    } catch (error) {
      // If waitFor times out, it means no visible modal was found.
      logger.log('No more modals found.');
      break;
    }
  }
};

export const runReservationFlow = async ({

  chromiumModule = chromium,

  logger = console,

  exit = process.exit,

  authPaths = getAuthPaths(),

  argv = process.argv,

  env = process.env,

  existsSync = fs.existsSync,

} = {}) => {

  const stationId = env.STATION_ID;

  if (!stationId) {

    logger.error("Please set STATION_ID environment variable.");

    return exit(1);

  }

  const reserveDate = env.RESERVE_DATE;

  if (!reserveDate) {

    logger.error("Please set RESERVE_DATE environment variable (e.g., '2026-01-31').");

    return exit(1);

  }

    const reserveStart = env.RESERVE_START;

    if (!reserveStart) {

      logger.error("Please set RESERVE_START environment variable (e.g., '19' or '08').");

      return exit(1);

    }

    const reserveEnd = env.RESERVE_END;

    if (!reserveEnd) {

      logger.error("Please set RESERVE_END environment variable (e.g., '21').");

      return exit(1);

    }

  

    // Parse hours to handle leading zeros, e.g., '08' -> '8'

    const startHourValue = parseInt(reserveStart, 10).toString();

    const endHourValue = parseInt(reserveEnd, 10).toString();

  

    const { authPath } = authPaths;

    if (!existsSync(authPath)) {

      logger.error(`Authentication file not found: ${authPath}`);

      logger.error("Please run 'node auth.js' first.");

      return exit(1);

    }

  

    const headlessMode = !argv.includes('--headed');

    const browser = await chromiumModule.launch({ headless: headlessMode });

    const context = await browser.newContext({

      storageState: authPath,

      userAgent: 'iPhone Safari/605.1.15',

    });

    const page = await context.newPage();

  

    try {

      const url = `https://share.timescar.jp/view/sp/reserve/input.jsp?scd=${stationId}`;

      logger.log(`Navigating to ${url}`);

      await page.goto(url, { waitUntil: 'domcontentloaded' });

      await closeAllModals(page, logger);

  

      const fullReserveDate = `${reserveDate} 00:00:00.0`;

  

      logger.log(`Setting start date to ${fullReserveDate} and start hour to ${startHourValue}`);

      await page.selectOption('#dateSpace', { value: fullReserveDate });

      await closeAllModals(page, logger);

      await page.selectOption('#hourSpace', { value: startHourValue });

      await closeAllModals(page, logger);

  

      logger.log('Clicking search button...');

      await page.click('#doSearchTargetTimetable');

      await page.waitForLoadState('networkidle');

      logger.log('Search results loaded.');

      await closeAllModals(page, logger);

  

          logger.log('Attempting to click "予約入力画面へ" button and wait for result...');

  

          const buttonSelector = 'a[data-role="button"][href="#reserve_page"]';

  

          await page.waitForSelector(buttonSelector, { state: 'visible', timeout: 10000 });

  

      

  

          await Promise.all([

  

            page.waitForSelector('#hourEnd', { state: 'visible', timeout: 10000 }), // Wait for the result

  

            page.evaluate((selector) => { // Trigger the action

  

              document.querySelector(selector)?.click();

  

            }, buttonSelector),

  

          ]);

  

          

  

                    logger.log('Navigated to reservation input screen and "hourEnd" is visible.');

  

          

  

          

  

          

  

                    await closeAllModals(page, logger); // Close modals after navigating to the new page

  

      // Set reservation end time

      logger.log(`Setting end date to ${fullReserveDate} and end hour to ${endHourValue}`);

      await page.selectOption('#dateEnd', { value: fullReserveDate });

      await closeAllModals(page, logger);

      await page.selectOption('#hourEnd', { value: endHourValue });

      await closeAllModals(page, logger);



        // Click "加入しない" for 安心補償サービス by clicking its label



        logger.log('Clicking "加入しない" for 安心補償サービス...');



        const exemptNocFlgNoLabelSelector = 'label[for="exemptNocFlgNo"]';



        await page.waitForSelector(exemptNocFlgNoLabelSelector, { state: 'visible', timeout: 5000 });



        await page.click(exemptNocFlgNoLabelSelector);



        logger.log('Clicked "加入しない" label.');



        await closeAllModals(page, logger); // Close any modals that might appear after the click



    logger.log('Clicking "入力内容確認" button...');
    const doCheckButtonSelector = '#doCheck';
    await page.waitForSelector(doCheckButtonSelector, { state: 'visible', timeout: 5000 });
    await page.click(doCheckButtonSelector);
    logger.log('Clicked "入力内容確認".');
    await closeAllModals(page, logger); // Close any modals after form submission

    logger.log('Navigated to reservation confirmation screen.');
    await closeAllModals(page, logger); // Close any modals after navigating to the confirmation page

    // Click "予約確定" button
    logger.log('Waiting for "予約確定" button to be visible...');
    const confirmButtonSelector = '#firstSubmitButton';
    await page.waitForSelector(confirmButtonSelector, { state: 'visible', timeout: 10000 });

    await page.click(confirmButtonSelector);
    logger.log('Clicked "予約確定".');
    await closeAllModals(page, logger); // Close any modals after confirmation click

        await page.waitForTimeout(5000); // Final wait to observe the state after booking

    

        // Confirm navigation to the final receipt page and close the browser

        await page.waitForFunction(() => document.title.includes('予約登録(受付)'), { timeout: 10000 });

        logger.log('Successfully completed reservation flow. "予約登録(受付)" page confirmed.');

    

      } catch (err) {

        logger.error('An error occurred:', err);

        await page.screenshot({ path: "debug_reserve-error.png" });

        logger.log('Screenshot saved to debug_reserve-error.png');

      } finally {

        if (browser) {

          await browser.close();

          logger.log('Browser closed.');

        }

      }

    };
    
    if (import.meta.url === `file://${process.argv[1]}`) {
      (async () => {
        await runReservationFlow();
      })();
    }
    
    
