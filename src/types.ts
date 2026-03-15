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

export interface CollectedData {
  finalUrl: string;
  resourceUrls: string[];
  totalSize: number;
  screenshotPath: string | null;
  error?: string;
}
export interface NormalizedTrackerInfoMap {
  [trackerDomain: string]: Omit<TrackerInfo, "rules">;
}

export interface NormalizationOptions {
  includeAllTrackers?: boolean;
  stripRules?: boolean;
}

export interface SiteResult {
  requestedUrl: string;
  finalUrl: string;
  domain: string;
  timestamp: string;
  screenshotPath: string | null;
  totalSize: number;
  resourceUrls?: string[];
  trackerDomains: string[];
  trackerDetails?: NormalizedTrackerInfoMap;
  error?: string;
  domainMetadata?: Omit<DomainInputEntry, "url">;
}

export interface FinalOutput {
  generationTimestamp: string;
  sourceFile?: string;
  allTrackers?: NormalizedTrackerInfoMap;
  scanResults: SiteResult[];
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
