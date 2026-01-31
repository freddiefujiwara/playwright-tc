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
  const log = logger.error ?? logger.log ?? (() => {});
  log('Checking for modals...');
  for (let i = 0; i < 10; i++) { // Limit attempts to avoid infinite loop
    try {
      // Find the first visible modal container. Wait up to 3 seconds.
      const modal = page.locator('div.info_message:visible').first();
      await modal.waitFor({ timeout: 3000 });

      // Find the primary action button within that modal and click it.
      const closeButton = modal.locator('a[data-role="button"]');
      await closeButton.click();

      log('Modal closed.');
      await page.waitForTimeout(1000); // Wait for transition
    } catch (error) {
      // If waitFor times out, it means no visible modal was found.
      log('No more modals found.');
      break;
    }
  }
};
