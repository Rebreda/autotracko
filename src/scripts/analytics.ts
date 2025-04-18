import path from "path";
import fs from "fs";
import { ScanResult, FinalOutput } from "../types";
import { normalizeResults } from "../utils/normalizeResults";

// --- Analytics Output Types (Remain the same) ---
interface FrequencyItem {
  name: string;
  count: number;
  percentage?: number;
}

interface GroupAnalysis {
  siteCount: number;
  totalTrackerInstances: number;
  averageTrackersPerSite: number;
  topTrackerOwners?: FrequencyItem[];
}

interface AnalyticsOutput {
  generationTimestamp: string;
  inputFile: string; // Path to the normalized results.json
  summary: {
    totalSitesProcessed: number;
    sitesWithErrors: number;
    sitesWithTrackers: number; // Sites with at least one tracker reference
    totalTrackerInstances: number; // Total references across all sites
    totalUniqueTrackerDomains: number; // Count from allTrackers map
    totalUniqueTrackerOwners: number; // Count unique owners from allTrackers map
    averageTrackersPerSite: number;
    averageUniqueTrackerDomainsPerSite: number; // Avg unique domains referenced per site
    averageUniqueTrackerOwnersPerSite: number; // Avg unique owners referenced per site
    averagePageSizeBytes: number;
  };
  trackerCountDistribution: {
    // Distribution of tracker reference counts per site
    min: number;
    max: number;
    median: number;
    mean: number;
  };
  topTrackerDomains: FrequencyItem[]; // By site count (how many sites reference the domain)
  topTrackerOwners: FrequencyItem[]; // By site count (how many sites reference a tracker owned by owner)
  topTrackerCategories: FrequencyItem[]; // By instance count (sum of references falling into category)
  analysisByCategory?: { [category: string]: GroupAnalysis };
  analysisByCountry?: { [country: string]: GroupAnalysis };
}

// --- Helper Functions (Remain the same) ---

function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getTopN(
  map: Map<string, number>,
  total: number,
  n: number = 20
): FrequencyItem[] {
  return Array.from(map.entries())
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, n)
    .map(([name, count]) => ({
      name,
      count,
      percentage: parseFloat(((count / total) * 100).toFixed(2)),
    }));
}

// --- Main Analytics Generation Function (Internal) ---

/**
 * Generates analytics from the normalized data structure.
 * @param data The FinalOutput object containing normalized results.
 * @param resultsFilePath Path to the normalized results.json file (for metadata).
 * @returns AnalyticsOutput object.
 */
function generateAnalyticsInternal( // Renamed from generateAnalytics
  data: FinalOutput,
  resultsFilePath: string
): AnalyticsOutput {
  const N_TOP_ITEMS = 20;
  const { allTrackers, scanResults } = data;
  const totalSitesProcessed = scanResults.length;

  if (totalSitesProcessed === 0) {
    throw new Error("Cannot generate analytics: No results found in input.");
  }

  let sitesWithErrors = 0;
  let sitesWithTrackers = 0;
  let totalTrackerInstances = 0; // Sum of trackerDomains.length across all results
  let totalPageSize = 0;

  const allTrackerCounts: number[] = []; // Count of tracker domains per site
  const uniqueDomainsPerSite: number[] = []; // Based on trackerDomains array
  const uniqueOwnersPerSite: number[] = []; // Calculated via lookup

  // Frequency Maps
  const trackerDomainSiteMap = new Map<string, Set<string>>(); // Tracker Domain -> Set<Site Domain>
  const trackerOwnerSiteMap = new Map<string, Set<string>>(); // Owner Name -> Set<Site Domain>
  const trackerCategoryInstanceMap = new Map<string, number>(); // Category -> Instance Count

  // Grouping Maps
  const categoryData = new Map<
    string,
    { siteDomains: Set<string>; trackerInstances: number }
  >();
  const countryData = new Map<
    string,
    { siteDomains: Set<string>; trackerInstances: number }
  >();
  const countryOwnerMap = new Map<string, Map<string, Set<string>>>();
  const categoryOwnerMap = new Map<string, Map<string, Set<string>>>();

  // Calculate total unique owners from the allTrackers map
  const uniqueOwnerNames = new Set<string>();
  Object.values(allTrackers).forEach((info) => {
    if (info?.owner) {
      uniqueOwnerNames.add(info.owner);
    } else {
      uniqueOwnerNames.add("Unknown Owner");
    }
  });
  const totalUniqueTrackerOwners = uniqueOwnerNames.size;
  const totalUniqueTrackerDomains = Object.keys(allTrackers).length;

  for (const result of scanResults) {
    // Iterate through NormalizedScanResult
    if (result.error) {
      sitesWithErrors++;
    }
    totalPageSize += result.totalSize || 0;

    const currentTrackerCount = result.trackerDomains.length;
    const hasTrackers = currentTrackerCount > 0;
    if (hasTrackers) {
      sitesWithTrackers++;
    }

    allTrackerCounts.push(currentTrackerCount);
    totalTrackerInstances += currentTrackerCount;

    const siteUniqueDomains = new Set<string>(result.trackerDomains); // Direct from trackerDomains
    const siteUniqueOwners = new Set<string>();

    // Process trackers for this site using lookups
    result.trackerDomains.forEach((trackerDomain) => {
      const trackerInfo = allTrackers[trackerDomain]; // LOOKUP
      if (!trackerInfo) {
        console.warn(
          `Tracker domain "${trackerDomain}" found in results but not in allTrackers map. Skipping.`
        );
        return; // Should not happen if normalization is correct
      }

      const ownerName = trackerInfo.owner || "Unknown Owner";
      const categories = trackerInfo.categories || []; // Use categories from info

      // Overall Frequencies
      if (!trackerDomainSiteMap.has(trackerDomain))
        trackerDomainSiteMap.set(trackerDomain, new Set());
      trackerDomainSiteMap.get(trackerDomain)?.add(result.domain);

      if (!trackerOwnerSiteMap.has(ownerName))
        trackerOwnerSiteMap.set(ownerName, new Set());
      trackerOwnerSiteMap.get(ownerName)?.add(result.domain);

      categories.forEach((category: string) => {
        // Use actual categories field
        trackerCategoryInstanceMap.set(
          category,
          (trackerCategoryInstanceMap.get(category) || 0) + 1
        );
      });

      // Per-site uniques
      // siteUniqueDomains already calculated from result.trackerDomains
      siteUniqueOwners.add(ownerName);

      // Grouping Frequencies
      const category = result.domainMetadata?.category || "Unknown Category";
      const country =
        result.domainMetadata?.owner?.country || "Unknown Country";

      if (!categoryData.has(category))
        categoryData.set(category, {
          siteDomains: new Set(),
          trackerInstances: 0,
        });
      categoryData.get(category)?.siteDomains.add(result.domain);
      categoryData.get(category)!.trackerInstances += 1;

      if (!countryData.has(country))
        countryData.set(country, {
          siteDomains: new Set(),
          trackerInstances: 0,
        });
      countryData.get(country)?.siteDomains.add(result.domain);
      countryData.get(country)!.trackerInstances += 1;

      // Grouped Owner Frequencies
      if (!countryOwnerMap.has(country))
        countryOwnerMap.set(country, new Map());
      if (!countryOwnerMap.get(country)!.has(ownerName))
        countryOwnerMap.get(country)!.set(ownerName, new Set());
      countryOwnerMap.get(country)!.get(ownerName)!.add(result.domain);

      if (!categoryOwnerMap.has(category))
        categoryOwnerMap.set(category, new Map());
      if (!categoryOwnerMap.get(category)!.has(ownerName))
        categoryOwnerMap.get(category)!.set(ownerName, new Set());
      categoryOwnerMap.get(category)!.get(ownerName)!.add(result.domain);
    }); // End forEach trackerDomain

    uniqueDomainsPerSite.push(siteUniqueDomains.size);
    uniqueOwnersPerSite.push(siteUniqueOwners.size);
  } // End for each result

  // --- Calculate Final Metrics ---

  const summary = {
    totalSitesProcessed,
    sitesWithErrors,
    sitesWithTrackers,
    totalTrackerInstances,
    totalUniqueTrackerDomains: totalUniqueTrackerDomains, // Use count from allTrackers
    totalUniqueTrackerOwners: totalUniqueTrackerOwners, // Use count derived from allTrackers
    averageTrackersPerSite: parseFloat(
      (totalTrackerInstances / totalSitesProcessed).toFixed(2)
    ),
    averageUniqueTrackerDomainsPerSite: parseFloat(
      // Avg unique domains referenced
      (
        uniqueDomainsPerSite.reduce((a, b) => a + b, 0) / totalSitesProcessed
      ).toFixed(2)
    ),
    averageUniqueTrackerOwnersPerSite: parseFloat(
      // Avg unique owners referenced
      (
        uniqueOwnersPerSite.reduce((a, b) => a + b, 0) / totalSitesProcessed
      ).toFixed(2)
    ),
    averagePageSizeBytes: Math.round(totalPageSize / totalSitesProcessed),
  };

  const trackerCountDistribution = {
    min: allTrackerCounts.length > 0 ? Math.min(...allTrackerCounts) : 0, // Handle empty case
    max: allTrackerCounts.length > 0 ? Math.max(...allTrackerCounts) : 0, // Handle empty case
    median: calculateMedian(allTrackerCounts),
    mean: summary.averageTrackersPerSite,
  };

  // Convert Site Maps to Counts (These maps were built correctly using lookups)
  const trackerDomainCounts = new Map(
    [...trackerDomainSiteMap.entries()].map(([domain, sites]) => [
      domain,
      sites.size,
    ])
  );
  const trackerOwnerCounts = new Map(
    [...trackerOwnerSiteMap.entries()].map(([owner, sites]) => [
      owner,
      sites.size,
    ])
  );

  const topTrackerDomains = getTopN(
    trackerDomainCounts,
    totalSitesProcessed,
    N_TOP_ITEMS
  );
  const topTrackerOwners = getTopN(
    trackerOwnerCounts,
    totalSitesProcessed,
    N_TOP_ITEMS
  );
  const topTrackerCategories = getTopN(
    // Built correctly using lookups
    trackerCategoryInstanceMap,
    totalTrackerInstances,
    N_TOP_ITEMS
  );

  // Process Grouped Analysis (Built correctly using lookups)
  const analysisByCategory: { [category: string]: GroupAnalysis } = {};
  for (const [category, catData] of categoryData.entries()) {
    const siteCount = catData.siteDomains.size;
    if (siteCount === 0) continue; // Avoid division by zero
    const ownerCounts = new Map(
      [...(categoryOwnerMap.get(category) || new Map()).entries()].map(
        ([owner, sites]) => [owner, sites.size]
      )
    );
    analysisByCategory[category] = {
      siteCount: siteCount,
      totalTrackerInstances: catData.trackerInstances,
      averageTrackersPerSite: parseFloat(
        (catData.trackerInstances / siteCount).toFixed(2)
      ),
      topTrackerOwners: getTopN(ownerCounts, siteCount, 5),
    };
  }

  const analysisByCountry: { [country: string]: GroupAnalysis } = {};
  for (const [country, countryDataEntry] of countryData.entries()) {
    const siteCount = countryDataEntry.siteDomains.size;
    if (siteCount === 0) continue; // Avoid division by zero
    const ownerCounts = new Map(
      [...(countryOwnerMap.get(country) || new Map()).entries()].map(
        ([owner, sites]) => [owner, sites.size]
      )
    );
    analysisByCountry[country] = {
      siteCount: siteCount,
      totalTrackerInstances: countryDataEntry.trackerInstances,
      averageTrackersPerSite: parseFloat(
        (countryDataEntry.trackerInstances / siteCount).toFixed(2)
      ),
      topTrackerOwners: getTopN(ownerCounts, siteCount, 5),
    };
  }

  // --- Construct Output ---
  const output: AnalyticsOutput = {
    generationTimestamp: new Date().toISOString(),
    inputFile: path.basename(resultsFilePath), // Should point to the normalized results.json
    summary,
    trackerCountDistribution,
    topTrackerDomains,
    topTrackerOwners,
    topTrackerCategories,
    analysisByCategory:
      Object.keys(analysisByCategory).length > 0
        ? analysisByCategory
        : undefined,
    analysisByCountry:
      Object.keys(analysisByCountry).length > 0 ? analysisByCountry : undefined,
  };

  return output;
}

// --- Script Execution Logic (Example Runner - Modified Flow) ---

// This part demonstrates how the normalization fits into the flow.
// Ideally, the normalization happens *after* all scans complete and *before*
// saving the final results.json used by analytics.

async function runAnalytics() {
  // Args for input (intermediate results) and output (analytics)
  const intermediateResultsArg = process.argv.find((arg) =>
    arg.startsWith("--results=")
  );
  const finalResultsPathArg = process.argv.find((arg) =>
    arg.startsWith("--output=")
  ); // Where to save normalized results
  const analyticsOutputPathArg = process.argv.find((arg) =>
    arg.startsWith("--analytics-output=")
  ); // Where to save analytics

  // --- File Paths ---
  // Assume --results points to a file containing ScanResult[] (intermediate)
  const intermediateResultsFilePath = intermediateResultsArg
    ? path.resolve(process.cwd(), intermediateResultsArg.split("=")[1])
    : path.resolve(process.cwd(), "intermediate_results.json"); // Default intermediate input

  // Define where the FINAL, NORMALIZED results will be saved
  const finalResultsFilePath = finalResultsPathArg
    ? path.resolve(process.cwd(), finalResultsPathArg.split("=")[1])
    : path.resolve(process.cwd(), "results.json"); // Default final (normalized) output

  // Define where the analytics report will be saved
  const analyticsFilePath = analyticsOutputPathArg
    ? path.resolve(process.cwd(), analyticsOutputPathArg.split("=")[1])
    : path.resolve(process.cwd(), "analytics.json"); // Default analytics output

  console.log(
    `Reading intermediate results from: ${intermediateResultsFilePath}`
  );
  console.log(`Writing final (normalized) results to: ${finalResultsFilePath}`);
  console.log(`Writing analytics report to: ${analyticsFilePath}`);

  // --- Load Intermediate Results ---
  let intermediateResultsData: ScanResult[] = [];
  try {
    if (!fs.existsSync(intermediateResultsFilePath)) {
      throw new Error(
        `Intermediate results file not found at ${intermediateResultsFilePath}`
      );
    }
    const rawData = fs.readFileSync(intermediateResultsFilePath, "utf-8");
    // IMPORTANT: Assume the intermediate file is an ARRAY of ScanResult
    intermediateResultsData = JSON.parse(rawData) as ScanResult[];
    if (!Array.isArray(intermediateResultsData)) {
      throw new Error(`Intermediate results file content is not a JSON array.`);
    }
  } catch (err: any) {
    console.error(`Error loading intermediate results file: ${err.message}`);
    process.exit(1);
  }

  // --- Normalize Results ---
  let finalOutputData: FinalOutput;
  try {
    console.log("Normalizing results...");
    finalOutputData = normalizeResults(
      intermediateResultsData,
      intermediateResultsFilePath
    );
    // Save the normalized data
    fs.writeFileSync(
      finalResultsFilePath,
      JSON.stringify(finalOutputData, null, 2),
      "utf-8"
    );
    console.log(
      `Normalized results saved successfully to ${finalResultsFilePath}`
    );
  } catch (err: any) {
    console.error(`Error normalizing results: ${err.message}`);
    process.exit(1);
  }

  // --- Generate Analytics from Normalized Data ---
  try {
    console.log("Generating analytics from normalized data...");
    // Pass the normalized data structure to the core analytics function
    const analytics = generateAnalyticsInternal(
      finalOutputData,
      finalResultsFilePath
    );

    // Save the analytics output
    fs.writeFileSync(
      analyticsFilePath,
      JSON.stringify(analytics, null, 2),
      "utf-8"
    );
    console.log(
      `Analytics generated successfully and saved to ${analyticsFilePath}`
    );
  } catch (err: any) {
    console.error(`Error generating analytics: ${err.message}`);
    process.exit(1);
  }
}

// Check if the script is run directly
if (require.main === module) {
  runAnalytics();
}
