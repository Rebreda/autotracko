import fs from "fs";
import path from "path";
import { DomainCacheEntry } from "./types";

/**
 * Finds a cache entry for a specific domain within the cache array. (Pure)
 * @param domain The domain to find.
 * @param cache The array of cache entries.
 * @returns The found entry or undefined.
 */
export const findCacheEntry = (
  domain: string,
  cache: readonly DomainCacheEntry[] // Use readonly for immutability hint
): DomainCacheEntry | undefined => {
  return cache.find((entry) => entry.domain === domain);
};

/**
 * Checks if a domain has been successfully processed based on the cache. (Pure)
 * @param domain The domain to check.
 * @param cache The array of cache entries.
 * @returns True if the domain exists in the cache and was successful, false otherwise.
 */
export const checkDomainProcessed = (
  domain: string,
  cache: readonly DomainCacheEntry[]
): boolean => {
  const entry = findCacheEntry(domain, cache);
  return !!entry && entry.success; // Ensure entry exists and success is true
};

/**
 * Creates a new cache array with an entry added or updated. (Pure, Immutable)
 * @param entry The DomainCacheEntry to add or update.
 * @param cache The current array of cache entries.
 * @returns A new array with the entry added or updated.
 */
export const updateOrAddCacheEntry = (
  entry: DomainCacheEntry,
  cache: readonly DomainCacheEntry[]
): DomainCacheEntry[] => {
  const index = cache.findIndex((c) => c.domain === entry.domain);
  if (index >= 0) {
    // Update: Create a new array with the updated entry
    return [
      ...cache.slice(0, index),
      entry, // Replace the old entry
      ...cache.slice(index + 1),
    ];
  } else {
    // Add: Create a new array with the new entry appended
    return [...cache, entry];
  }
};

// --- Impure Cache I/O Functions ---

const DEFAULT_CACHE_FILE_PATH = path.join(__dirname, "..", "cache.json");

/**
 * Reads the cache data from a JSON file. (Impure - File I/O)
 * @param filePath The path to the cache file. Defaults to cache.json in parent dir.
 * @returns An array of DomainCacheEntry, or an empty array if file doesn't exist or parsing fails.
 */
export const readCacheFromFile = (
  filePath: string = DEFAULT_CACHE_FILE_PATH
): DomainCacheEntry[] => {
  try {
    if (!fs.existsSync(filePath)) {
      console.debug(`Cache file not found at ${filePath}, starting empty.`);
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    // Basic validation before parsing
    if (!raw.trim()) {
      console.debug(`Cache file at ${filePath} is empty, starting empty.`);
      return [];
    }
    const parsed = JSON.parse(raw);
    // Add basic type checking (ensure it's an array)
    if (!Array.isArray(parsed)) {
      console.error(
        `Error parsing cache file ${filePath}: content is not an array. Starting empty.`
      );
      return [];
    }
    // Optionally add deeper validation for each entry if needed
    return parsed as DomainCacheEntry[];
  } catch (e: any) {
    console.error(
      `Error reading or parsing cache file ${filePath}: ${e.message}. Starting empty.`
    );
    return [];
  }
};

/**
 * Writes the cache data to a JSON file. (Impure - File I/O)
 * @param cache The array of DomainCacheEntry to save.
 * @param filePath The path to the cache file. Defaults to cache.json in parent dir.
 * @returns True if successful, false otherwise.
 */
export const writeCacheToFile = (
  cache: readonly DomainCacheEntry[],
  filePath: string = DEFAULT_CACHE_FILE_PATH
): boolean => {
  try {
    const dataToWrite = JSON.stringify(cache, null, 2); // Pretty print
    // Ensure directory exists before writing
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(filePath, dataToWrite, "utf-8");
    console.debug(`Cache successfully written to ${filePath}`);
    return true;
  } catch (e: any) {
    console.error(`Error writing cache file to ${filePath}: ${e.message}`);
    return false;
  }
};
