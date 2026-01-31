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

export const persistAuthState = async ({
  context,
  authDir,
  authPath,
  fsModule = fs,
  logger = console,
} = {}) => {
  try {
    fsModule.mkdirSync(authDir, { recursive: true });
    await context.storageState({ path: authPath });
    logger.log(`Saved authentication data: ${authPath}`);
  } catch (err) {
    logger.error("Failed to save auth.json:", err);
  }
};

const performLogin = async (page, { cardNo, password }) => {
  await page.goto('https://share.timescar.jp/view/sp/member/mypage.jsp', { waitUntil: 'domcontentloaded' });

  const cardNo1 = cardNo.substring(0, 4);
  const cardNo2 = cardNo.substring(4);

  await page.fill('input[name="tpLoginForm:cardNo1"]', cardNo1);
  await page.fill('input[name="tpLoginForm:cardNo2"]', cardNo2);
  await page.fill('input[name="tpLoginForm:tpPassword"]', password);

  await page.click('input[name="tpLoginForm:doLoginForTp"]');

  await page.waitForURL('https://share.timescar.jp/view/sp/member/mypage.jsp');
};

const closeAllModals = async (page, logger = console) => {
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

export const runAuthFlow = async ({
  chromiumModule = chromium,
  logger = console,
  exit = process.exit,
  authPaths = getAuthPaths(),
  persistFn = persistAuthState,
  env = process.env,
} = {}) => {
  const cardNo = env.TIMESCAR_CARD_NO;
  if (!cardNo) {
    logger.error('Please set TIMESCAR_CARD_NO environment variable.');
    throw new Error('TIMESCAR_CARD_NO environment variable is missing.');
  }
  const password = env.TIMESCAR_PASSWORD;
  if (!password) {
    logger.error('Please set TIMESCAR_PASSWORD environment variable.');
    throw new Error('TIMESCAR_PASSWORD environment variable is missing.');
  }

  const headlessMode = !process.argv.includes('--headed');
  const browser = await chromiumModule.launch({ headless: headlessMode });
  const context = await browser.newContext({ userAgent: 'iPhone Safari/605.1.15' });
  const page = await context.newPage();

  try {
    await performLogin(page, { cardNo, password });
    logger.log('Successfully logged in.');

    // Navigate to establish the session correctly and handle modals

    await closeAllModals(page, logger);

    await persistFn({
      context,
      authDir: authPaths.authDir,
      authPath: authPaths.authPath,
      logger,
    });
    await exit(0); // Explicitly exit with 0 on success
  } finally {
    await browser.close();
  }
};

/* c8 ignore next 3 */
if (import.meta.main) {
  (async () => {
    await runAuthFlow();
  })();
}
