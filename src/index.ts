import fs from "fs";
import path from "path";
import { URL } from "url";
import { Command } from "commander";

// Import refactored modules & types
import { loadAndPrepareTrackerData, PreparedTrackerData } from "./tracker";
import { scanWebsite } from "./scanner";
import { ScanResult, DomainInputEntry, DomainCacheEntry } from "./types"; // Import updated types
import {
  readCacheFromFile,
  writeCacheToFile,
  checkDomainProcessed,
  updateOrAddCacheEntry,
} from "./cache";

// Define paths relative to the script location or CWD
const DEFAULT_DOMAINS_FILE = "domains.json"; // <--- Changed default
const DEFAULT_OUTPUT_FILE = "results.json";
const DEFAULT_CACHE_FILE = "cache.json";
const DEFAULT_TRACKER_FILE = path.join(
  __dirname,
  "data",
  "extension-mv3-tds.json"
);

// --- Helper Functions ---
const getHostnameSafe = (url: string): string | null => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

// --- Main Application Logic ---

const program = new Command();

program
  .name("autotracko") // <--- Updated name
  .description(
    "Scans websites for third-party trackers using DuckDuckGo TDS data"
  )
  .option(
    "-d, --domains <path>",
    "JSON file with list of domain objects to scan", // <--- Updated description
    DEFAULT_DOMAINS_FILE // <--- Updated default
  )
  .option(
    "-o, --output <path>",
    "Output JSON file for scan results",
    DEFAULT_OUTPUT_FILE
  )
  .option(
    "-c, --cache <path>",
    "Cache file to track processed domains",
    DEFAULT_CACHE_FILE
  )
  .option("--no-cache", "Disable reading from or writing to the cache file")
  .option(
    "-t, --tracker-list <path>",
    "Path to the tracker list JSON file (e.g., extension-mv3-tds.json)",
    DEFAULT_TRACKER_FILE
  )
  .option(
    "--headless <mode>",
    "Run browser in headless mode ('true', 'false')",
    "true"
  )
  .action(async (options) => {
    // --- Path Resolution ---
    const domainsFilePath = path.resolve(process.cwd(), options.domains);
    const resultsFilePath = path.resolve(process.cwd(), options.output);
    const cacheEnabled = options.cache !== false;
    const cacheFilePath = cacheEnabled
      ? path.resolve(process.cwd(), options.cache as string)
      : "";
    const trackerListFilePath = path.resolve(options.trackerList);

    // --- Logging Setup ---
    console.log("Starting Autotracko scan process..."); // <--- Updated name
    console.log(`Domains file: ${domainsFilePath}`);
    console.log(`Results file: ${resultsFilePath}`);
    if (cacheEnabled) {
      console.log(`Cache file: ${cacheFilePath} (Cache enabled)`);
    } else {
      console.log("Cache file: (Caching disabled via --no-cache)");
    }
    console.log(`Tracker list: ${trackerListFilePath}`);
    console.log(`Headless mode: ${options.headless}`);

    // 1. Load and Prepare Tracker Data (Once)
    console.log("Loading and preparing tracker data...");
    const preparedTrackerData: PreparedTrackerData | null =
      loadAndPrepareTrackerData(trackerListFilePath);
    if (!preparedTrackerData) {
      console.error(
        `Critical error: Failed to load or prepare tracker data from ${trackerListFilePath}. Aborting.`
      );
      process.exit(1);
    }
    console.log(
      `Tracker data loaded. ${preparedTrackerData.normalizedMap.size} tracker domains prepared.`
    );

    // 2. Load Domains List from JSON
    let domainInputs: DomainInputEntry[] = [];
    try {
      if (!fs.existsSync(domainsFilePath)) {
        throw new Error(`Domains file not found.`);
      }
      const rawData = fs.readFileSync(domainsFilePath, "utf-8");
      const parsedData = JSON.parse(rawData);

      // Basic validation
      if (!Array.isArray(parsedData)) {
        throw new Error("Domains file content must be a JSON array.");
      }

      domainInputs = parsedData.filter(
        (entry: any): entry is DomainInputEntry => {
          if (typeof entry?.url !== "string" || !entry.url) {
            console.warn(
              "Skipping entry with missing or invalid 'url':",
              JSON.stringify(entry)
            );
            return false;
          }
          // Ensure URL validity and add scheme if missing
          try {
            let urlToValidate = entry.url;
            if (
              !urlToValidate.startsWith("http://") &&
              !urlToValidate.startsWith("https://")
            ) {
              urlToValidate = `https://${urlToValidate}`; // Default to https
            }
            new URL(urlToValidate); // Validate
            entry.url = urlToValidate; // Update entry with potentially prefixed URL
            return true;
          } catch {
            console.warn(
              `Skipping entry with invalid URL format: ${entry.url}`
            );
            return false;
          }
        }
      );

      if (domainInputs.length === 0) {
        throw new Error(
          "No valid domain entries found in the domains JSON file."
        );
      }
      console.log(
        `Loaded ${domainInputs.length} valid domain entries to scan.`
      );
    } catch (err: any) {
      console.error(
        `Error loading or parsing domains from ${domainsFilePath}: ${err.message}`
      );
      process.exit(1);
    }

    // 3. Load Initial Cache (Once, if enabled)
    let currentCache: DomainCacheEntry[] = cacheEnabled
      ? readCacheFromFile(cacheFilePath)
      : [];
    if (cacheEnabled) {
      console.log(`Loaded ${currentCache.length} entries from cache.`);
    }

    // 4. Load Initial Results
    let results: ScanResult[] = [];
    try {
      if (fs.existsSync(resultsFilePath)) {
        const rawResults = fs.readFileSync(resultsFilePath, "utf-8");
        if (rawResults.trim()) {
          results = JSON.parse(rawResults) as ScanResult[];
          console.log(
            `Loaded ${results.length} previous results from ${resultsFilePath}.`
          );
        }
      }
    } catch (err: any) {
      console.error(
        `Error loading previous results from ${resultsFilePath}: ${err.message}. Starting fresh results.`
      );
      results = [];
    }

    // 5. Process Domains
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Iterate through the input objects
    for (const domainInput of domainInputs) {
      const url = domainInput.url; // Get URL from the input object
      const domainName = getHostnameSafe(url);

      if (!domainName) {
        // This should ideally not happen due to earlier validation, but check anyway
        console.warn(
          `Could not extract domain from validated URL: ${url}. Skipping.`
        );
        skippedCount++;
        continue;
      }

      // Extract metadata (excluding URL) to potentially add to results
      const { url: _url, ...domainMetadata } = domainInput;

      // Check cache (if enabled)
      if (cacheEnabled && checkDomainProcessed(domainName, currentCache)) {
        console.log(
          `Skipping ${url} (marked as successfully processed in cache)`
        );
        skippedCount++;
        continue;
      }

      console.log(`Scanning ${url}...`);
      let scanResultData: Omit<ScanResult, "domainMetadata"> | null = null; // Base scan result without metadata yet
      let success = false;
      let scanError: string | undefined = undefined;

      try {
        let headlessValue =
          options.headless.toLowerCase() === "false" ? false : true;

        // Execute the scan - scanWebsite returns the base ScanResult structure
        scanResultData = await scanWebsite(url, preparedTrackerData, {
          launchOptions: {
            headless: headlessValue,
          },
        });

        if (scanResultData.error) {
          console.warn(
            `Scan for ${url} completed with internal error: ${scanResultData.error}`
          );
          scanError = scanResultData.error;
          success = false;
          errorCount++;
        } else {
          console.log(
            `Finished scanning ${url}. Found ${scanResultData.trackers.length} trackers.`
          );
          success = true;
          processedCount++;
        }

        // Combine scan data with input metadata for the final result entry
        const finalResult: ScanResult = {
          ...scanResultData,
          domainMetadata:
            Object.keys(domainMetadata).length > 0 ? domainMetadata : undefined, // Add metadata if it exists
        };
        results.push(finalResult);
      } catch (err: any) {
        console.error(`Critical error processing ${url}: ${err.message}`);
        scanError = err.message;
        success = false;
        errorCount++;
        // Optionally add a partial result with metadata
        const errorResult: ScanResult = {
          requestedUrl: url,
          finalUrl: url,
          domain: domainName,
          timestamp: new Date().toISOString(),
          screenshotPath: null,
          totalSize: 0,
          resourceUrls: [],
          trackers: [],
          error: err.message,
          domainMetadata:
            Object.keys(domainMetadata).length > 0 ? domainMetadata : undefined,
        };
        results.push(errorResult);
      }

      // Update cache (if enabled)
      if (cacheEnabled) {
        const cacheEntry: DomainCacheEntry = {
          domain: domainName,
          lastChecked: new Date().toISOString(),
          success: success,
          error: scanError,
        };
        currentCache = updateOrAddCacheEntry(cacheEntry, currentCache);
        writeCacheToFile(currentCache, cacheFilePath);
      }

      // Write intermediate results (Impure)
      try {
        fs.writeFileSync(
          resultsFilePath,
          JSON.stringify(results, null, 2),
          "utf-8"
        );
      } catch (writeErr: any) {
        console.error(
          `Failed to write intermediate results to ${resultsFilePath}: ${writeErr.message}`
        );
      }
    } // End of domain loop

    // 6. Final Summary
    console.log("\n--- Scan Complete ---");
    console.log(`Total entries in input file: ${domainInputs.length}`);
    console.log(`Successfully processed: ${processedCount}`);
    console.log(`Skipped (cached or invalid): ${skippedCount}`);
    console.log(`Errors during processing: ${errorCount}`);
    console.log(`Total results saved: ${results.length}`);
    console.log(`Results saved to ${resultsFilePath}`);
    if (cacheEnabled) {
      console.log(`Cache saved to ${cacheFilePath}`);
    } else {
      console.log("Caching was disabled.");
    }
  });

// Execute the command line parser
program.parse(process.argv);
