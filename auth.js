import { chromium } from "playwright";
import fs from "fs";
import { closeAllModals, getAuthPaths } from "./lib/common.js";

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

const requireEnvValue = ({ env, key, logger, errorMessage, throwMessage }) => {
  const value = env[key];
  if (!value) {
    logger.error(errorMessage);
    throw new Error(throwMessage);
  }
  return value;
};

export const runAuthFlow = async ({
  chromiumModule = chromium,
  logger = console,
  exit = process.exit,
  authPaths = getAuthPaths(),
  persistFn = persistAuthState,
  argv = process.argv,
  env = process.env,
} = {}) => {
  const cardNo = requireEnvValue({
    env,
    key: 'TIMESCAR_CARD_NO',
    logger,
    errorMessage: 'Please set TIMESCAR_CARD_NO environment variable.',
    throwMessage: 'TIMESCAR_CARD_NO environment variable is missing.',
  });
  const password = requireEnvValue({
    env,
    key: 'TIMESCAR_PASSWORD',
    logger,
    errorMessage: 'Please set TIMESCAR_PASSWORD environment variable.',
    throwMessage: 'TIMESCAR_PASSWORD environment variable is missing.',
  });

  const headlessMode = !argv.includes('--headed');
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
