import path from "path";
import {
  ScanResult,
  FinalOutput,
  NormalizedTrackerInfoMap,
  NormalizedScanResult,
} from "../types";

// --- Normalization Function ---
/**
 * Normalizes the intermediate scan results into the final output structure.
 * @param intermediateResults An array of ScanResult objects.
 * @returns The FinalOutput object ready to be saved.
 */

export function normalizeResults(
  intermediateResults: ScanResult[],
  sourceFileName?: string
): FinalOutput {
  const allTrackers: NormalizedTrackerInfoMap = {};
  const normalizedScanResults: NormalizedScanResult[] = [];

  for (const result of intermediateResults) {
    const trackerDomains: string[] = [];
    for (const tracker of result.trackers) {
      const trackerDomain = tracker.domain;
      const trackerInfo = tracker.info; // Already Omit<TrackerInfo, 'rules'>

      trackerDomains.push(trackerDomain);

      // Add tracker info to the global map if not already present
      if (!allTrackers[trackerDomain]) {
        allTrackers[trackerDomain] = trackerInfo;
      }
    }

    // Create the normalized result, copying necessary fields
    const normalizedResult: NormalizedScanResult = {
      requestedUrl: result.requestedUrl,
      finalUrl: result.finalUrl,
      domain: result.domain,
      timestamp: result.timestamp,
      screenshotPath: result.screenshotPath,
      totalSize: result.totalSize,
      // resourceUrls: result.resourceUrls, // Decide if you want to keep these
      trackerDomains: trackerDomains, // Store only the domains
      error: result.error,
      domainMetadata: result.domainMetadata,
    };
    normalizedScanResults.push(normalizedResult);
  }

  return {
    generationTimestamp: new Date().toISOString(),
    sourceFile: sourceFileName ? path.basename(sourceFileName) : undefined,
    allTrackers: allTrackers,
    scanResults: normalizedScanResults,
  };
}
