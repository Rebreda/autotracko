import path from "path";
import {
  SiteResult,
  FinalOutput,
  NormalizedTrackerInfoMap,
  NormalizationOptions,
  TrackerInfo,
} from "../types";

export function normalizeResults(
  siteResults: SiteResult[],
  sourceFileName?: string,
  options?: NormalizationOptions
): FinalOutput {
  const includeAllTrackers = options?.includeAllTrackers !== false;
  const stripRules = options?.stripRules !== false;

  const allTrackers: NormalizedTrackerInfoMap = {};
  const normalizedScanResults: SiteResult[] = [];

  for (const result of siteResults) {
    for (const trackerDomain of result.trackerDomains) {
      const trackerInfo = result.trackerDetails?.[trackerDomain];
      if (!trackerInfo) {
        continue;
      }

      if (includeAllTrackers && !allTrackers[trackerDomain]) {
        allTrackers[trackerDomain] = sanitizeTrackerInfo(trackerInfo, stripRules);
      }
    }

    const normalizedResult: SiteResult = {
      requestedUrl: result.requestedUrl,
      finalUrl: result.finalUrl,
      domain: result.domain,
      timestamp: result.timestamp,
      screenshotPath: result.screenshotPath,
      totalSize: result.totalSize,
      trackerDomains: [...result.trackerDomains].sort((a, b) =>
        a.localeCompare(b)
      ),
      error: result.error,
      domainMetadata: result.domainMetadata,
    };
    normalizedScanResults.push(normalizedResult);
  }

  const sortedAllTrackers = includeAllTrackers
    ? Object.fromEntries(
        Object.entries(allTrackers).sort(([a], [b]) => a.localeCompare(b))
      )
    : undefined;

  return {
    generationTimestamp: new Date().toISOString(),
    sourceFile: sourceFileName ? path.basename(sourceFileName) : undefined,
    allTrackers: sortedAllTrackers,
    scanResults: normalizedScanResults,
  };
}

export const sanitizeTrackerInfo = (
  trackerInfo: Omit<TrackerInfo, "rules">,
  stripRules: boolean
): Omit<TrackerInfo, "rules"> => {
  if (!stripRules) {
    return { ...trackerInfo };
  }

  // Defensive copy that ensures heavy `rules` arrays are never persisted.
  const { rules: _rules, ...safeInfo } = trackerInfo as TrackerInfo;
  return safeInfo;
};
