import { LaunchOptions } from "puppeteer";

// --- Input & Metadata Types ---

export interface DomainOwnerInfo {
  name: string;
  displayName?: string;
  country?: string;
}

export interface DomainInputEntry {
  url: string;
  owner?: DomainOwnerInfo;
  category?: string;
  language?: string;
}

// --- Tracker Definition Types ---

export interface TrackerInfo {
  owner: string;
  prevalence: number;
  fingerprinting?: number;
  cookies?: number;
  rules?: any[]; // This may exist in the source list but is removed before final storage
  default?: string;
  categories?: string[]; // Ensure this is used by analytics
  [key: string]: any;
}

export interface TrackerList {
  trackers: { [domain: string]: TrackerInfo };
  [key: string]: any;
}

// --- Scanner Configuration ---

interface ScreenshotOptions {
  enabled: boolean;
  directory?: string;
  fullPage?: boolean;
}

export interface ScannerConfig {
  userAgent?: string;
  viewport?: { width: number; height: number };
  navigationTimeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
  screenshotOptions?: ScreenshotOptions;
  launchOptions?: LaunchOptions;
}

// --- Intermediate Scan Result (Output of scanner.ts) ---

export interface ScanResult {
  requestedUrl: string;
  finalUrl: string;
  domain: string;
  timestamp: string;
  screenshotPath: string | null;
  totalSize: number;
  resourceUrls: string[];
  // Trackers identified, info excludes 'rules'
  trackers: { domain: string; info: Omit<TrackerInfo, "rules"> }[];
  error?: string;
  domainMetadata?: Omit<DomainInputEntry, "url">;
}

// --- Data Collection Helper Type ---
export interface CollectedData {
  finalUrl: string;
  resourceUrls: string[];
  totalSize: number;
  screenshotPath: string | null;
  error?: string;
}

// --- Final Normalized Output Structure (results.json) ---

// Map of unique tracker domains to their info (rules excluded)
export interface NormalizedTrackerInfoMap {
  [trackerDomain: string]: Omit<TrackerInfo, "rules">;
}

// Represents a scan result with tracker references instead of embedded info
export interface NormalizedScanResult {
  requestedUrl: string;
  finalUrl: string;
  domain: string;
  timestamp: string;
  screenshotPath: string | null;
  totalSize: number;
  // resourceUrls: string[]; // Optional: Keep if needed, remove to save more space
  trackerDomains: string[]; // References to keys in NormalizedTrackerInfoMap
  error?: string;
  domainMetadata?: Omit<DomainInputEntry, "url">;
}

// The final structure written to results.json
export interface FinalOutput {
  generationTimestamp: string; // Add timestamp for the results file itself
  sourceFile?: string; // Optional: name of the original intermediate file
  allTrackers: NormalizedTrackerInfoMap;
  scanResults: NormalizedScanResult[];
}

// --- Analytics Output Structure ---
// (Keep the existing AnalyticsOutput structure from analytics.ts,
//  it describes the output of the analytics process, not the scan results file)

// --- Misc Types ---
export interface DomainCacheEntry {
  domain: string;
  lastChecked: string;
  success: boolean;
  error?: string;
}
