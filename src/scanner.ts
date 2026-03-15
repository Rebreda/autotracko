import puppeteer, { Browser, Page, HTTPResponse } from "puppeteer";
import { findTrackerInfo, PreparedTrackerData } from "./tracker";
import { URL } from "url";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  ScannerConfig,
  CollectedData,
  SiteResult,
  NormalizedTrackerInfoMap,
} from "./types";

const DEFAULT_CONFIG: Required<ScannerConfig> = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  viewport: { width: 1280, height: 800 },
  navigationTimeout: 30000,
  waitUntil: "networkidle2",
  screenshotOptions: {
    enabled: true,
    directory: path.join(process.cwd(), "results", "screenshots"),
    fullPage: true,
  },
  launchOptions: {
    headless: true, // Default to headless
  },
};

/**
 * Extracts hostname safely from a URL string.
 */
const getHostname = (url: string): string | null => {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null; // Invalid URL
  }
};

const getStableScreenshotFileName = (url: string): string => {
  const hostname = getHostname(url) || "unknown-domain";
  const digest = crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);
  return `${hostname}-${digest}.png`;
};

const collectWebsiteData = async (
  url: string,
  config: Required<ScannerConfig>
): Promise<CollectedData> => {
  let browser: Browser | null = null;
  let page: Page | null = null;
  const collected: CollectedData = {
    finalUrl: url, // Initial value, updated on success
    resourceUrls: [],
    totalSize: 0,
    screenshotPath: null,
  };

  try {
    browser = await puppeteer.launch(config.launchOptions);
    page = await browser.newPage();

    await page.setUserAgent(config.userAgent);
    await page.setViewport(config.viewport);

    page.on("response", async (response: HTTPResponse) => {
      try {
        const resUrl = response.url();
        collected.resourceUrls.push(resUrl);
        const headers = response.headers();
        if (headers["content-length"]) {
          collected.totalSize += parseInt(headers["content-length"], 10);
        }
      } catch (e) {
        // Ignore errors for individual responses during collection
      }
    });

    console.debug(
      `Navigating to ${url} with waitUntil: ${config.waitUntil}...`
    );
    const navigationResponse = await page.goto(url, {
      waitUntil: config.waitUntil,
      timeout: config.navigationTimeout,
    });

    // Update final URL after potential redirects
    collected.finalUrl = page.url();

    if (!navigationResponse) {
      console.warn(`Navigation to ${url} returned null response.`);
      // Decide if this is an error or just a warning
      // collected.error = "Navigation failed to return a response.";
    } else if (!navigationResponse.ok()) {
      console.warn(
        `Navigation to ${url} failed with status: ${navigationResponse.status()}`
      );
      // collected.error = `Navigation failed with status: ${navigationResponse.status()}`;
    }

    // --- Screenshot Logic ---
    if (
      config.screenshotOptions.enabled &&
      config.screenshotOptions.directory
    ) {
      try {
        const screenshotDir = config.screenshotOptions.directory;
        if (!fs.existsSync(screenshotDir)) {
          fs.mkdirSync(screenshotDir, { recursive: true });
        }
        const filename = getStableScreenshotFileName(collected.finalUrl);
        collected.screenshotPath = path.join(screenshotDir, filename);

        console.debug(`Taking screenshot: ${collected.screenshotPath}`);
        await page.screenshot({
          path: collected.screenshotPath,
          fullPage: config.screenshotOptions.fullPage,
        });
      } catch (err: any) {
        console.error(`Error capturing screenshot for ${url}: ${err.message}`);
        collected.screenshotPath = null; // Ensure path is null on error
        // Optionally add to collected.error
      }
    }
  } catch (err: any) {
    console.error(
      `Error during website data collection for ${url}: ${err.message}`
    );
    collected.error = err.message; // Capture the primary error
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr: any) {
        console.error(`Error closing browser: ${closeErr.message}`);
        // Append error if needed
        collected.error = collected.error
          ? `${collected.error}; Browser close error: ${closeErr.message}`
          : `Browser close error: ${closeErr.message}`;
      }
    }
  }
  return collected;
};

export const identifyTrackers = (
  resourceUrls: string[],
  preparedTrackerData: PreparedTrackerData | null
): NormalizedTrackerInfoMap => {
  if (!preparedTrackerData) return {};

  const trackersFound: NormalizedTrackerInfoMap = {};
  const uniqueDomains = new Set<string>();

  resourceUrls.forEach((resUrl) => {
    const resDomain = getHostname(resUrl);
    if (resDomain && !uniqueDomains.has(resDomain)) {
      uniqueDomains.add(resDomain);
      const trackerInfo = findTrackerInfo(resDomain, preparedTrackerData);
      if (trackerInfo) {
        trackersFound[resDomain] = trackerInfo;
      }
    }
  });

  return trackersFound;
};

export const scanWebsite = async (
  url: string,
  preparedTrackerData: PreparedTrackerData | null,
  options?: ScannerConfig
): Promise<SiteResult> => {
  const config: Required<ScannerConfig> = {
    ...DEFAULT_CONFIG,
    ...options,
    screenshotOptions: {
      ...DEFAULT_CONFIG.screenshotOptions,
      ...(options?.screenshotOptions ?? {}),
    },
    launchOptions: {
      ...DEFAULT_CONFIG.launchOptions,
      ...(options?.launchOptions ?? {}),
    },
  };

  const startTime = new Date();
  const collectedData = await collectWebsiteData(url, config);
  const trackerDetails = identifyTrackers(collectedData.resourceUrls, preparedTrackerData);
  const result: SiteResult = {
    requestedUrl: url,
    finalUrl: collectedData.finalUrl,
    domain: getHostname(collectedData.finalUrl) || "unknown",
    timestamp: startTime.toISOString(),
    screenshotPath: collectedData.screenshotPath,
    totalSize: collectedData.totalSize,
    resourceUrls: collectedData.resourceUrls,
    trackerDomains: Object.keys(trackerDetails),
    trackerDetails,
    error: collectedData.error,
  };

  return result;
};
