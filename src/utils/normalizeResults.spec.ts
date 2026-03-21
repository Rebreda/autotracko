import { normalizeResults, sanitizeTrackerInfo } from "./normalizeResults";
import type { SiteResult } from "../types";

const sampleScanResult: SiteResult = {
  requestedUrl: "https://example.com",
  finalUrl: "https://example.com",
  domain: "example.com",
  timestamp: "2026-01-01T00:00:00.000Z",
  screenshotPath: null,
  totalSize: 1234,
  httpStatus: 200,
  pageTitle: "Example Domain",
  accessStatus: "ok",
  resourceUrls: ["https://cdn.example.com/script.js"],
  trackerDomains: ["tracker-a.com", "tracker-b.com"],
  trackerDetails: {
    "tracker-a.com": {
      owner: "Tracker A",
      prevalence: 0.5,
      categories: ["Advertising"],
      default: "block",
      rules: [{ rule: "tracker-a\\.com" }],
    } as any,
    "tracker-b.com": {
      owner: "Tracker B",
      prevalence: 0.2,
    },
  },
};

describe("sanitizeTrackerInfo", () => {
  it("removes rules by default when stripRules is true", () => {
    const sanitized = sanitizeTrackerInfo(
      {
        owner: "Tracker A",
        prevalence: 0.5,
        rules: [{ rule: "x" }],
      } as any,
      true
    ) as any;

    expect(sanitized.rules).toBeUndefined();
    expect(sanitized.owner).toBe("Tracker A");
  });

  it("keeps rules when stripRules is false", () => {
    const sanitized = sanitizeTrackerInfo(
      {
        owner: "Tracker A",
        prevalence: 0.5,
        rules: [{ rule: "x" }],
      } as any,
      false
    ) as any;

    expect(Array.isArray(sanitized.rules)).toBe(true);
  });
});

describe("normalizeResults", () => {
  it("builds normalized output with allTrackers by default", () => {
    const out = normalizeResults([sampleScanResult], "results.tmp.json");

    expect(out.sourceFile).toBe("results.tmp.json");
    expect(out.scanResults).toHaveLength(1);
    expect(out.scanResults[0].trackerDomains).toEqual([
      "tracker-a.com",
      "tracker-b.com",
    ]);
    expect(out.scanResults[0].accessStatus).toBe("ok");
    expect(out.scanResults[0].httpStatus).toBe(200);
    expect(out.scanResults[0].pageTitle).toBe("Example Domain");
    expect(out.allTrackers).toBeDefined();
    expect(Object.keys(out.allTrackers || {})).toHaveLength(2);

    const trackerA = (out.allTrackers || {})["tracker-a.com"] as any;
    expect(trackerA).toBeDefined();
    expect(trackerA.rules).toBeUndefined();
  });

  it("can omit allTrackers for compact output", () => {
    const out = normalizeResults([sampleScanResult], "results.tmp.json", {
      includeAllTrackers: false,
    });

    expect(out.allTrackers).toBeUndefined();
    expect(out.scanResults[0].trackerDomains).toEqual([
      "tracker-a.com",
      "tracker-b.com",
    ]);
  });
});
