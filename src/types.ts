import { LaunchOptions } from "puppeteer";

/**
 * Represents the owner of a domain being scanned.
 */
export interface DomainOwnerInfo {
  name: string; // e.g., "Wikimedia Foundation"
  displayName?: string; // e.g.,"Wikipedia"
  country?: string; // e.g., "CA", "US", "Global"
  // Add other relevant owner details if needed
}

/**
 * Represents a single entry in the domains.json input file.
 */
export interface DomainInputEntry {
  url: string; // The primary URL to scan (mandatory)
  owner?: DomainOwnerInfo; // Optional owner information
  category?: string; // e.g., "News", "Reference", "Technology"
  language?: string; // e.g., "en", "fr"
  // Add other relevant metadata as needed
}

/**
 * Defines the structure for details about a specific tracker domain.
 */
export interface TrackerInfo {
  owner: string;
  prevalence: number;
  // Example additional fields (add actual fields from your data)
  fingerprinting?: number;
  cookies?: number;
  rules?: any[]; // Define more specific type if possible
  default?: string; // e.g., "block"
  // Allow other potential properties from the source JSON
  [key: string]: any;
}

/**
 * Defines the structure for the overall tracker list data.
 */
export interface TrackerList {
  trackers: { [domain: string]: TrackerInfo };
  // Allow other top-level properties from the source JSON (e.g., entities, cnames)
  [key: string]: any;
}

// --- Configuration Interfaces ---
interface ScreenshotOptions {
  enabled: boolean;
  directory?: string; // Defaults to ../screenshots relative to this file
  fullPage?: boolean; // Defaults to true
}
export interface ScannerConfig {
  userAgent?: string;
  viewport?: { width: number; height: number };
  navigationTimeout?: number; // milliseconds
  waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
  screenshotOptions?: ScreenshotOptions;
  launchOptions?: LaunchOptions; // Allow passing puppeteer launch options
}
// --- Result Interfaces ---

export interface ScanResult {
  requestedUrl: string;
  finalUrl: string; // The URL after redirects
  domain: string;
  timestamp: string;
  screenshotPath: string | null;
  totalSize: number; // in bytes (approximate)
  resourceUrls: string[];
  trackers: { domain: string; info: TrackerInfo }[];
  error?: string; // Optional error message if scan failed partially or fully
  domainMetadata?: Omit<DomainInputEntry, "url">; // Include metadata from input, excluding the URL itself
}

export interface CollectedData {
  finalUrl: string;
  resourceUrls: string[];
  totalSize: number;
  screenshotPath: string | null;
  error?: string; // Error during collection
}
export interface DomainCacheEntry {
  domain: string;
  lastChecked: string;
  success: boolean;
  error?: string; // Optional: Store error message on failure
}
