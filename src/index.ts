import fs from "fs";
import path from "path";
import { URL } from "url";
import { Command } from "commander";

// Import refactored modules & types
import { loadAndPrepareTrackerData, PreparedTrackerData } from "./tracker";
import { scanWebsite } from "./scanner";
// Import necessary types
import {
  ScanResult,
  DomainInputEntry,
  DomainCacheEntry,
  FinalOutput, // Import the final structure type
} from "./types";
// Import the normalization function
import {
  readCacheFromFile,
  writeCacheToFile,
  checkDomainProcessed,
  updateOrAddCacheEntry,
} from "./cache";
import { normalizeResults } from "./utils/normalizeResults";

// Define paths relative to the script location or CWD
const DEFAULT_DOMAINS_FILE = "domains.json";
// DEFAULT_OUTPUT_FILE now refers to the FINAL NORMALIZED results file
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
  .name("autotracko")
  .description(
    "Scans websites for third-party trackers and saves normalized results." // Updated description
  )
  .option(
    "-d, --domains <path>",
    "JSON file with list of domain objects to scan",
    DEFAULT_DOMAINS_FILE
  )
  .option(
    "-o, --output <path>",
    "Output JSON file for final normalized scan results", // Updated description
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
    // resultsFilePath now points to the final, normalized output file
    const resultsFilePath = path.resolve(process.cwd(), options.output);
    const cacheEnabled = options.cache !== false;
    const cacheFilePath = cacheEnabled
      ? path.resolve(process.cwd(), options.cache as string)
      : "";
    const trackerListFilePath = path.resolve(options.trackerList);

    // --- Logging Setup ---
    console.log("Starting Autotracko scan and normalization process..."); // Updated log
    console.log(`Domains file: ${domainsFilePath}`);
    console.log(`Final results file: ${resultsFilePath}`); // Updated log
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
            console.warn("Skipping entry with missing/invalid 'url'.");
            return false;
          }
          try {
            let urlToValidate = entry.url;
            if (!urlToValidate.startsWith("http")) {
              urlToValidate = `https://${urlToValidate}`;
            }
            new URL(urlToValidate);
            entry.url = urlToValidate;
            return true;
          } catch {
            console.warn(`Skipping invalid URL: ${entry.url}`);
            return false;
          }
        }
      );

      if (domainInputs.length === 0) {
        throw new Error("No valid domain entries found.");
      }
      console.log(
        `Loaded ${domainInputs.length} valid domain entries to scan.`
      );
    } catch (err: any) {
      console.error(
        `Error loading domains from ${domainsFilePath}: ${err.message}`
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

    // 4. Initialize Intermediate Results Array
    // This will hold ScanResult objects before normalization
    let intermediateResults: ScanResult[] = [];

    // --- REMOVED initial loading of results file ---
    // We will generate the normalized file fresh.

    // 5. Process Domains
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Iterate through the input objects
    for (const domainInput of domainInputs) {
      const url = domainInput.url;
      const domainName = getHostnameSafe(url);

      if (!domainName) {
        console.warn(
          `Could not extract domain from validated URL: ${url}. Skipping.`
        );
        skippedCount++;
        continue;
      }

      const { url: _url, ...domainMetadata } = domainInput;

      if (cacheEnabled && checkDomainProcessed(domainName, currentCache)) {
        console.log(`Skipping ${url} (cached)`);
        skippedCount++;
        continue;
      }

      console.log(
        `Scanning ${url} [${processedCount + skippedCount + errorCount + 1}/${
          domainInputs.length
        }]...`
      );
      let scanResultData: Omit<ScanResult, "domainMetadata"> | null = null;
      let success = false;
      let scanError: string | undefined = undefined;

      try {
        let headlessValue = options.headless.toLowerCase() !== "false";

        // Execute scan - returns intermediate ScanResult
        scanResultData = await scanWebsite(url, preparedTrackerData, {
          launchOptions: { headless: headlessValue },
        });

        if (scanResultData.error) {
          console.warn(
            `Scan for ${url} completed with error: ${scanResultData.error}`
          );
          scanError = scanResultData.error;
          success = false;
          errorCount++;
        } else {
          console.log(
            `Finished ${url}. Found ${scanResultData.trackers.length} trackers.`
          );
          success = true;
          processedCount++;
        }

        // Combine scan data with metadata for the intermediate result
        const intermediateResult: ScanResult = {
          ...scanResultData,
          domainMetadata:
            Object.keys(domainMetadata).length > 0 ? domainMetadata : undefined,
        };
        intermediateResults.push(intermediateResult); // Add to intermediate array
      } catch (err: any) {
        console.error(`Critical error processing ${url}: ${err.message}`);
        scanError = err.message;
        success = false;
        errorCount++;
        // Add a partial error result to intermediate array
        intermediateResults.push({
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
        });
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
        // Consider moving cache writing outside the loop for efficiency,
        // but writing incrementally provides better fault tolerance.
        writeCacheToFile(currentCache, cacheFilePath);
      }

      // --- REMOVED writing intermediate results inside the loop ---
    } // --- End of domain loop ---

    // 6. Normalize Results AFTER the loop
    console.log("\nAll scans attempted. Normalizing results...");
    let finalOutput: FinalOutput;
    try {
      // Pass the path where the final output will be saved for metadata
      finalOutput = normalizeResults(intermediateResults, resultsFilePath);
      console.log(
        `Normalization complete. Found ${
          Object.keys(finalOutput.allTrackers).length
        } unique trackers across ${finalOutput.scanResults.length} results.`
      );
    } catch (normErr: any) {
      console.error(`Failed to normalize results: ${normErr.message}`);
      // Decide how to handle this - maybe save intermediate results?
      console.error(
        "Saving intermediate results instead due to normalization error."
      );
      try {
        fs.writeFileSync(
          resultsFilePath.replace(".json", ".intermediate.json"), // Save intermediate separately
          JSON.stringify(intermediateResults, null, 2),
          "utf-8"
        );
      } catch (writeErr: any) {
        console.error(
          `Failed to write intermediate results after normalization error: ${writeErr.message}`
        );
      }
      process.exit(1); // Exit if normalization failed
    }

    // 7. Write FINAL Normalized Results (Once)
    try {
      console.log(`Saving final normalized results to ${resultsFilePath}...`);
      fs.writeFileSync(
        resultsFilePath,
        JSON.stringify(finalOutput, null, 2), // Save the final normalized object
        "utf-8"
      );
      console.log(`Final results successfully saved to ${resultsFilePath}.`);
    } catch (writeErr: any) {
      console.error(
        `Failed to write final results to ${resultsFilePath}: ${writeErr.message}`
      );
    }

    // 8. Final Summary
    console.log("\n--- Scan and Normalization Complete ---"); // Updated log
    console.log(`Total entries in input file: ${domainInputs.length}`);
    console.log(`Successfully processed scans: ${processedCount}`);
    console.log(`Skipped (cached or invalid): ${skippedCount}`);
    console.log(`Errors during scanning: ${errorCount}`);
    console.log(
      `Total results processed for normalization: ${intermediateResults.length}`
    );
    console.log(`Final normalized results saved to ${resultsFilePath}`); // Updated log
    if (cacheEnabled) {
      console.log(`Cache saved to ${cacheFilePath}`);
    } else {
      console.log("Caching was disabled.");
    }
    console.log(
      "\nRun the analytics command separately on the results.json file if needed."
    );
  });

// Execute the command line parser
program.parse(process.argv);
