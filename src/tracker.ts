import { TrackerList, TrackerInfo } from "./types"; // Use the same types file
import fs from "fs";

// Re-export types
export * from "./types";

/**
 * Normalizes a domain name for consistent lookups.
 */
export const normalizeDomain = (domain: string): string => {
  if (!domain) return "";
  return domain.toLowerCase().replace(/^www\./, "");
};

/**
 * Parses the raw tracker data string into the TrackerList structure.
 */
export const parseTrackerData = (rawData: string): TrackerList => {
  let parsed: any;
  try {
    // Consider adding more robust validation here if needed (e.g., using Zod)
    parsed = JSON.parse(rawData);
  } catch (error: any) {
    // Catch JSON syntax errors
    console.error("Failed to parse tracker data JSON:", error);
    throw new Error(`Invalid tracker data format: ${error.message}`);
  }

  // Validate the structure after successful parsing
  if (
    !parsed ||
    typeof parsed.trackers !== "object" ||
    parsed.trackers === null || // Explicitly check for null
    Array.isArray(parsed.trackers) // Explicitly check for array
  ) {
    // Throw specific error for structure validation failure
    throw new Error("Parsed data must include a valid 'trackers' object.");
  }

  return parsed as TrackerList;
};

/**
 * Represents the prepared data structure for efficient lookups.
 */
export interface PreparedTrackerData {
  originalList: TrackerList;
  // Map from normalized tracker domain to the original domain key
  normalizedMap: ReadonlyMap<string, string>;
}

/**
 * Prepares tracker data for efficient lookups.
 */
export const prepareTrackerData = (
  trackerList: TrackerList
): PreparedTrackerData => {
  // Add validation for the input trackerList structure
  if (
    !trackerList ||
    typeof trackerList.trackers !== "object" ||
    trackerList.trackers === null ||
    Array.isArray(trackerList.trackers)
  ) {
    console.warn(
      "Preparing tracker data: Invalid input provided (trackers is not a valid object). Returning empty."
    );
    return { originalList: { trackers: {} }, normalizedMap: new Map() };
  }

  const normalizedMap = new Map<string, string>();
  for (const originalDomain in trackerList.trackers) {
    // Object.hasOwn is safer than `in` for prototype pollution
    if (Object.hasOwn(trackerList.trackers, originalDomain)) {
      normalizedMap.set(normalizeDomain(originalDomain), originalDomain);
    }
  }
  // Make the map readonly for stronger immutability hint, though Map itself is mutable
  return {
    originalList: trackerList,
    normalizedMap: normalizedMap as ReadonlyMap<string, string>,
  };
};

/**
 * Finds tracker information for a domain using prepared data.
 */
export const findTrackerInfo = (
  domain: string,
  preparedData: PreparedTrackerData | null // Allow null to handle loading errors gracefully
): TrackerInfo | null => {
  // Gracefully handle cases where data might not have loaded/prepared correctly
  if (!preparedData || preparedData.normalizedMap.size === 0) {
    return null;
  }

  const normDomain = normalizeDomain(domain);
  if (!normDomain) return null; // Ignore empty normalized domains

  const { originalList, normalizedMap } = preparedData;

  // 1. Check for exact match using the pre-normalized map
  const exactMatchOriginalDomain = normalizedMap.get(normDomain);
  if (exactMatchOriginalDomain) {
    // Use Object.hasOwn for safety before accessing
    return Object.hasOwn(originalList.trackers, exactMatchOriginalDomain)
      ? originalList.trackers[exactMatchOriginalDomain]
      : null; // Should technically exist if in map, but check anyway
  }

  // 2. Check for subdomain match (e.g., domain="sub.tracker.com", tracker="tracker.com")
  // Iterate through the pre-normalized map entries
  for (const [normTracker, originalTrackerDomain] of normalizedMap.entries()) {
    // Ensure normTracker is not empty before suffix check
    if (normTracker && normDomain.endsWith(`.${normTracker}`)) {
      return Object.hasOwn(originalList.trackers, originalTrackerDomain)
        ? originalList.trackers[originalTrackerDomain]
        : null; // Should exist, but check
    }
  }

  return null; // No match found
};

/**
 * Loads tracker data from a file, parses it, and prepares lookup indexes.
 */
export const loadAndPrepareTrackerData = (
  filePath: string
): PreparedTrackerData | null => {
  try {
    console.debug("Loading tracker data from:", filePath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at ${filePath}`);
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsedData = parseTrackerData(raw); // This handles JSON syntax and basic structure errors
    const preparedData = prepareTrackerData(parsedData); // This handles tracker object validation
    console.debug("Tracker data loaded and prepared successfully.");
    return preparedData;
  } catch (error: any) {
    console.error(
      `Failed to load and prepare tracker data from file "${filePath}":`,
      error.message // Log only the message for cleaner output
    );
    return null; // Return null to indicate failure, allowing graceful handling
  }
};
