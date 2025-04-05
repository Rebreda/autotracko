import puppeteer, { Browser, Page, HTTPResponse } from "puppeteer";
import { findTrackerInfo, PreparedTrackerData, TrackerInfo } from "./tracker"; // Import functional parts
import { URL } from "url";
import fs from "fs";
import path from "path";
import { ScannerConfig, CollectedData, ScanResult } from "./types";

// --- Default Configuration ---

const DEFAULT_CONFIG: Required<ScannerConfig> = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  viewport: { width: 1280, height: 800 },
  navigationTimeout: 30000,
  waitUntil: "networkidle2",
  screenshotOptions: {
    enabled: true,
    directory: path.join(__dirname, "..", "screenshots"),
    fullPage: true,
  },
  launchOptions: {
    headless: true, // Default to headless
  },
};

// --- Helper Functions ---

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

// --- Core Logic ---

/**
 * (Impure Function - Browser Interaction & File System)
 * Launches Puppeteer, navigates to the URL, collects resource data, and takes a screenshot.
 * @param url The URL to scan.
 * @param config Scanner configuration options.
 * @returns Collected data or an error indication.
 */
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
        const domainName = getHostname(collected.finalUrl) || "unknown-domain";
        const filename = `${domainName}-${Date.now()}.png`;
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

/**
 * (Pure Function)
 * Identifies trackers from a list of resource URLs using prepared tracker data.
 * @param resourceUrls List of URLs collected from the website.
 * @param preparedTrackerData Prepared tracker data for lookups.
 * @returns An array of found trackers with their info.
 */
export const identifyTrackers = (
  resourceUrls: string[],
  preparedTrackerData: PreparedTrackerData | null
): { domain: string; info: TrackerInfo }[] => {
  if (!preparedTrackerData) return []; // No data to check against

  const trackersFound: { domain: string; info: TrackerInfo }[] = [];
  const uniqueDomains = new Set<string>();

  resourceUrls.forEach((resUrl) => {
    const resDomain = getHostname(resUrl);
    if (resDomain && !uniqueDomains.has(resDomain)) {
      uniqueDomains.add(resDomain);
      // console.debug(`Checking domain: ${resDomain}`); // Less verbose logging
      const trackerInfo = findTrackerInfo(resDomain, preparedTrackerData);
      if (trackerInfo) {
        // console.debug(`Found tracker: ${resDomain}`); // Log only found ones
        trackersFound.push({ domain: resDomain, info: trackerInfo });
      }
    }
  });

  return trackersFound;
};

/**
 * Scans the provided URL by collecting data and identifying trackers.
 * Orchestrates the impure data collection and pure tracker identification.
 * @param url The URL to scan.
 * @param preparedTrackerData The prepared tracker data (required).
 * @param options Optional scanner configuration.
 * @returns A ScanResult object.
 */
export const scanWebsite = async (
  url: string,
  preparedTrackerData: PreparedTrackerData | null, // Inject tracker data
  options?: ScannerConfig
): Promise<ScanResult> => {
  // Merge user options with defaults
  const config: Required<ScannerConfig> = {
    ...DEFAULT_CONFIG,
    ...options,
    // Deep merge screenshot options if provided
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

  // 1. Collect data (Impure)
  const collectedData = await collectWebsiteData(url, config);

  // 2. Identify trackers (Pure)
  const trackers = identifyTrackers(
    collectedData.resourceUrls,
    preparedTrackerData
  );

  // 3. Construct final result
  const result: ScanResult = {
    requestedUrl: url,
    finalUrl: collectedData.finalUrl,
    domain: getHostname(collectedData.finalUrl) || "unknown",
    timestamp: startTime.toISOString(),
    screenshotPath: collectedData.screenshotPath,
    totalSize: collectedData.totalSize,
    resourceUrls: collectedData.resourceUrls,
    trackers: trackers,
    error: collectedData.error, // Include error from collection phase
  };

  return result;
};
