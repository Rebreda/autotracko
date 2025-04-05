import path from "path";
import fs from "fs";
import { ScanResult } from "../types";

// --- Helper Types ---
interface FrequencyItem {
  name: string;
  count: number; // Number of sites it appears on (for domains/owners) or instances (for categories)
  percentage?: number; // Percentage relative to total sites or total instances
}

interface GroupAnalysis {
  siteCount: number;
  totalTrackerInstances: number;
  averageTrackersPerSite: number;
  topTrackerOwners?: FrequencyItem[]; // Example: Top 5 owners for this group
  // Add other group-specific metrics if needed
}

interface AnalyticsOutput {
  generationTimestamp: string;
  inputFile: string;
  summary: {
    totalSitesProcessed: number;
    sitesWithErrors: number;
    sitesWithTrackers: number;
    totalTrackerInstances: number;
    totalUniqueTrackerDomains: number;
    totalUniqueTrackerOwners: number;
    averageTrackersPerSite: number;
    averageUniqueTrackerDomainsPerSite: number;
    averageUniqueTrackerOwnersPerSite: number;
    averagePageSizeBytes: number;
  };
  trackerCountDistribution: {
    min: number;
    max: number;
    median: number;
    mean: number; // Same as averageTrackersPerSite
  };
  topTrackerDomains: FrequencyItem[]; // By site count
  topTrackerOwners: FrequencyItem[]; // By site count
  topTrackerCategories: FrequencyItem[]; // By instance count
  analysisByCategory?: { [category: string]: GroupAnalysis };
  analysisByCountry?: { [country: string]: GroupAnalysis };
  // Add more sections based on selected metrics
}

// --- Helper Functions ---

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

// --- Main Analytics Function ---

export function generateAnalytics(
  results: ScanResult[],
  resultsFilePath: string
): AnalyticsOutput {
  const N_TOP_ITEMS = 20; // How many items for Top N lists
  const totalSitesProcessed = results.length;
  if (totalSitesProcessed === 0) {
    throw new Error("Cannot generate analytics: No results found in input.");
  }

  let sitesWithErrors = 0;
  let sitesWithTrackers = 0;
  let totalTrackerInstances = 0;
  let totalPageSize = 0;

  const allTrackerCounts: number[] = [];
  const uniqueDomainsPerSite: number[] = [];
  const uniqueOwnersPerSite: number[] = [];

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
  const countryOwnerMap = new Map<string, Map<string, Set<string>>>(); // Country -> Owner -> Set<Site Domain>
  const categoryOwnerMap = new Map<string, Map<string, Set<string>>>(); // Category -> Owner -> Set<Site Domain>

  for (const result of results) {
    if (result.error) {
      sitesWithErrors++;
    }
    totalPageSize += result.totalSize || 0;

    const hasTrackers = result.trackers && result.trackers.length > 0;
    if (hasTrackers) {
      sitesWithTrackers++;
    }

    const currentTrackerCount = result.trackers?.length || 0;
    allTrackerCounts.push(currentTrackerCount);
    totalTrackerInstances += currentTrackerCount;

    const siteUniqueDomains = new Set<string>();
    const siteUniqueOwners = new Set<string>();

    // Process trackers for this site
    result.trackers?.forEach((tracker) => {
      const trackerDomain = tracker.domain;
      const ownerName = tracker.info?.owner || "Unknown Owner";

      // Overall Frequencies
      if (!trackerDomainSiteMap.has(trackerDomain))
        trackerDomainSiteMap.set(trackerDomain, new Set());
      trackerDomainSiteMap.get(trackerDomain)?.add(result.domain);

      if (!trackerOwnerSiteMap.has(ownerName))
        trackerOwnerSiteMap.set(ownerName, new Set());
      trackerOwnerSiteMap.get(ownerName)?.add(result.domain);

      tracker.info?.categories?.forEach((category: string) => {
        trackerCategoryInstanceMap.set(
          category,
          (trackerCategoryInstanceMap.get(category) || 0) + 1
        );
      });

      // Per-site uniques
      siteUniqueDomains.add(trackerDomain);
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
      categoryData.get(category)!.trackerInstances += 1; // Increment instance count for category

      if (!countryData.has(country))
        countryData.set(country, {
          siteDomains: new Set(),
          trackerInstances: 0,
        });
      countryData.get(country)?.siteDomains.add(result.domain);
      countryData.get(country)!.trackerInstances += 1; // Increment instance count for country

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
    });

    uniqueDomainsPerSite.push(siteUniqueDomains.size);
    uniqueOwnersPerSite.push(siteUniqueOwners.size);
  }

  // --- Calculate Final Metrics ---

  const summary = {
    totalSitesProcessed,
    sitesWithErrors,
    sitesWithTrackers,
    totalTrackerInstances,
    totalUniqueTrackerDomains: trackerDomainSiteMap.size,
    totalUniqueTrackerOwners: trackerOwnerSiteMap.size,
    averageTrackersPerSite: parseFloat(
      (totalTrackerInstances / totalSitesProcessed).toFixed(2)
    ),
    averageUniqueTrackerDomainsPerSite: parseFloat(
      (
        uniqueDomainsPerSite.reduce((a, b) => a + b, 0) / totalSitesProcessed
      ).toFixed(2)
    ),
    averageUniqueTrackerOwnersPerSite: parseFloat(
      (
        uniqueOwnersPerSite.reduce((a, b) => a + b, 0) / totalSitesProcessed
      ).toFixed(2)
    ),
    averagePageSizeBytes: Math.round(totalPageSize / totalSitesProcessed),
  };

  const trackerCountDistribution = {
    min: Math.min(...allTrackerCounts),
    max: Math.max(...allTrackerCounts),
    median: calculateMedian(allTrackerCounts),
    mean: summary.averageTrackersPerSite,
  };

  // Convert Site Maps to Counts
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
    trackerCategoryInstanceMap,
    totalTrackerInstances,
    N_TOP_ITEMS
  );

  // Process Grouped Analysis
  const analysisByCategory: { [category: string]: GroupAnalysis } = {};
  for (const [category, data] of categoryData.entries()) {
    const siteCount = data.siteDomains.size;
    const ownerCounts = new Map(
      [...(categoryOwnerMap.get(category) || new Map()).entries()].map(
        ([owner, sites]) => [owner, sites.size]
      )
    );
    analysisByCategory[category] = {
      siteCount: siteCount,
      totalTrackerInstances: data.trackerInstances,
      averageTrackersPerSite: parseFloat(
        (data.trackerInstances / siteCount).toFixed(2)
      ),
      topTrackerOwners: getTopN(ownerCounts, siteCount, 5), // Top 5 owners per category
    };
  }

  const analysisByCountry: { [country: string]: GroupAnalysis } = {};
  for (const [country, data] of countryData.entries()) {
    const siteCount = data.siteDomains.size;
    const ownerCounts = new Map(
      [...(countryOwnerMap.get(country) || new Map()).entries()].map(
        ([owner, sites]) => [owner, sites.size]
      )
    );
    analysisByCountry[country] = {
      siteCount: siteCount,
      totalTrackerInstances: data.trackerInstances,
      averageTrackersPerSite: parseFloat(
        (data.trackerInstances / siteCount).toFixed(2)
      ),
      topTrackerOwners: getTopN(ownerCounts, siteCount, 5), // Top 5 owners per country
    };
  }

  // --- Construct Output ---
  const output: AnalyticsOutput = {
    generationTimestamp: new Date().toISOString(),
    inputFile: path.basename(resultsFilePath),
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

// --- Script Execution Logic (Example Runner) ---

// This part would typically be in a separate file or integrated into index.ts
// For simplicity, included here. You might want a dedicated CLI command for analytics.

async function runAnalytics() {
  // Simple argument parsing (replace with commander if making a separate CLI tool)
  const resultsArg = process.argv.find((arg) => arg.startsWith("--results="));
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));

  const resultsFilePath = resultsArg
    ? path.resolve(process.cwd(), resultsArg.split("=")[1])
    : path.resolve(process.cwd(), "results.json"); // Default input

  const analyticsFilePath = outputArg
    ? path.resolve(process.cwd(), outputArg.split("=")[1])
    : path.resolve(process.cwd(), "analytics.json"); // Default output

  console.log(`Reading results from: ${resultsFilePath}`);
  console.log(`Writing analytics to: ${analyticsFilePath}`);

  let resultsData: ScanResult[] = [];
  try {
    if (!fs.existsSync(resultsFilePath)) {
      throw new Error(`Results file not found at ${resultsFilePath}`);
    }
    const rawData = fs.readFileSync(resultsFilePath, "utf-8");
    resultsData = JSON.parse(rawData) as ScanResult[];
    if (!Array.isArray(resultsData)) {
      throw new Error(`Results file content is not a JSON array.`);
    }
  } catch (err: any) {
    console.error(`Error loading results file: ${err.message}`);
    process.exit(1);
  }

  try {
    const analytics = generateAnalytics(resultsData, resultsFilePath);
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
