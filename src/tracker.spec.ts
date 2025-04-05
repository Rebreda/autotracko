import {
  normalizeDomain,
  parseTrackerData,
  prepareTrackerData,
  findTrackerInfo,
  PreparedTrackerData,
} from "./tracker";
import type { TrackerList, TrackerInfo } from "./types";

// --- Mock Data (Remains the same) ---
const mockTrackerInfoGoogle: TrackerInfo = {
  owner: "Google LLC",
  prevalence: 0.9,
};
const mockTrackerInfoFacebook: TrackerInfo = {
  owner: "Facebook, Inc.",
  prevalence: 0.8,
};
const mockTrackerInfoExample: TrackerInfo = {
  owner: "Example Org",
  prevalence: 0.1,
};
const mockAnalyticsProvider: TrackerInfo = {
  owner: "Analytics Co",
  prevalence: 0.2,
};

const mockTrackerListData: TrackerList = {
  trackers: {
    "google-analytics.com": mockTrackerInfoGoogle,
    "facebook.net": mockTrackerInfoFacebook,
    "example.com": mockTrackerInfoExample,
    "www.analytics-provider.net": mockAnalyticsProvider,
  },
  entities: {},
};

const mockRawTrackerJson = JSON.stringify(mockTrackerListData);

// --- Test Suite using Jest ---

describe("normalizeDomain", () => {
  it("should return lowercase", () => {
    expect(normalizeDomain("GOOGLE.COM")).toBe("google.com");
  });
  it("should remove leading www.", () => {
    expect(normalizeDomain("www.google.com")).toBe("google.com");
  });
  it("should handle uppercase WWW.", () => {
    expect(normalizeDomain("WWW.GOOGLE.COM")).toBe("google.com");
  });
  it("should not remove mid-string www.", () => {
    expect(normalizeDomain("sub.www.google.com")).toBe("sub.www.google.com");
  });
  it("should handle empty string", () => {
    expect(normalizeDomain("")).toBe("");
  });
  it("should handle domain without www.", () => {
    expect(normalizeDomain("google.com")).toBe("google.com");
  });
});

describe("parseTrackerData", () => {
  it("should parse valid JSON", () => {
    const parsedData = parseTrackerData(mockRawTrackerJson);
    expect(parsedData).toEqual(mockTrackerListData);
  });

  it("should throw on invalid JSON syntax", () => {
    // Check that the error message starts with the prefix and includes the underlying parse error
    expect(() => parseTrackerData("{invalid json")).toThrow(
      // Match the prefix and allow any specific JSON error message after it
      /^Invalid tracker data format: /
    );
    // Or match the specific underlying error if needed and stable across Node versions
    // expect(() => parseTrackerData("{invalid json")).toThrow(
    //   "Invalid tracker data format: Expected property name or '}' in JSON at position 1"
    // );
  });

  it("should throw if 'trackers' key is missing", () => {
    // This error is now thrown by the custom validation
    expect(() => parseTrackerData('{"entities": {}}')).toThrow(
      "Parsed data must include a valid 'trackers' object."
    );
  });

  it("should throw if 'trackers' is an array", () => {
    // This error is now thrown by the custom validation
    expect(() => parseTrackerData('{"trackers": []}')).toThrow(
      "Parsed data must include a valid 'trackers' object."
    );
  });

  it("should throw if 'trackers' is null", () => {
    // This error is now thrown by the custom validation
    expect(() => parseTrackerData('{"trackers": null}')).toThrow(
      "Parsed data must include a valid 'trackers' object."
    );
  });

  it("should throw if 'trackers' is not an object (e.g., string)", () => {
    // This error is now thrown by the custom validation
    expect(() => parseTrackerData('{"trackers": "not-an-object"}')).toThrow(
      "Parsed data must include a valid 'trackers' object."
    );
  });
});

describe("prepareTrackerData", () => {
  // Prepare data once for this describe block
  const preparedData = prepareTrackerData(mockTrackerListData);

  it("should return PreparedTrackerData structure", () => {
    expect(preparedData.normalizedMap).toBeInstanceOf(Map);
    expect(preparedData.originalList).toBeDefined();
  });

  it("should create a map with correct size", () => {
    expect(preparedData.normalizedMap.size).toBe(4);
  });

  it("should map normalized domains to original domains", () => {
    expect(preparedData.normalizedMap.get("google-analytics.com")).toBe(
      "google-analytics.com"
    );
    expect(preparedData.normalizedMap.get("facebook.net")).toBe("facebook.net");
    expect(preparedData.normalizedMap.get("example.com")).toBe("example.com");
    expect(preparedData.normalizedMap.get("analytics-provider.net")).toBe(
      "www.analytics-provider.net"
    );
  });

  it("should preserve the original tracker list", () => {
    expect(preparedData.originalList).toEqual(mockTrackerListData);
  });

  it("should handle null input gracefully", () => {
    const invalidPrepared = prepareTrackerData(null as any);
    expect(invalidPrepared.normalizedMap.size).toBe(0);
    expect(invalidPrepared.originalList).toEqual({ trackers: {} });
  });

  it("should handle empty trackers object gracefully", () => {
    const emptyPrepared = prepareTrackerData({ trackers: {} });
    expect(emptyPrepared.normalizedMap.size).toBe(0);
    expect(emptyPrepared.originalList).toEqual({ trackers: {} });
  });

  // Add test for invalid trackers type input based on updated validation
  it("should handle invalid trackers type (array) gracefully", () => {
    const invalidInput = { trackers: [] } as unknown as TrackerList;
    const invalidPrepared = prepareTrackerData(invalidInput);
    expect(invalidPrepared.normalizedMap.size).toBe(0);
    expect(invalidPrepared.originalList).toEqual({ trackers: {} });
  });
});

describe("findTrackerInfo", () => {
  // Prepare data once for all tests in this block
  const preparedData = prepareTrackerData(mockTrackerListData);

  const testCases: Array<{
    domain: string;
    expected: TrackerInfo | null;
    desc: string;
  }> = [
    // Exact matches
    {
      domain: "google-analytics.com",
      expected: mockTrackerInfoGoogle,
      desc: "Exact match",
    },
    {
      domain: "GOOGLE-ANALYTICS.COM",
      expected: mockTrackerInfoGoogle,
      desc: "Exact match (uppercase)",
    },
    {
      domain: "www.google-analytics.com",
      expected: mockTrackerInfoGoogle,
      desc: "Exact match (www)",
    },
    {
      domain: "facebook.net",
      expected: mockTrackerInfoFacebook,
      desc: "Exact match 2",
    },
    {
      domain: "analytics-provider.net",
      expected: mockAnalyticsProvider,
      desc: "Exact match (normalized www)",
    },
    {
      domain: "www.analytics-provider.net",
      expected: mockAnalyticsProvider,
      desc: "Exact match (explicit www)",
    },

    // Subdomain matches
    {
      domain: "track.google-analytics.com",
      expected: mockTrackerInfoGoogle,
      desc: "Subdomain match",
    },
    {
      domain: "metrics.EXAMPLE.com",
      expected: mockTrackerInfoExample,
      desc: "Subdomain match (uppercase)",
    },
    {
      domain: "connect.www.facebook.net",
      expected: mockTrackerInfoFacebook,
      desc: "Subdomain match (www)",
    },
    {
      domain: "data.analytics-provider.net",
      expected: mockAnalyticsProvider,
      desc: "Subdomain match (normalized www)",
    },

    // Non-matches
    { domain: "google.com", expected: null, desc: "Non-tracker domain" },
    { domain: "notsub.notsuper.com", expected: null, desc: "Unrelated domain" },
    { domain: "example.net", expected: null, desc: "Different TLD" },
    { domain: "", expected: null, desc: "Empty string domain" },
    { domain: "www.", expected: null, desc: "Only www." },
  ];

  test.each(testCases)(
    "should handle: $desc ($domain)",
    ({ domain, expected }) => {
      const result = findTrackerInfo(domain, preparedData);
      expect(result).toEqual(expected);
    }
  );

  it("should return null if preparedData is null", () => {
    expect(findTrackerInfo("google-analytics.com", null)).toBeNull();
  });

  it("should return null if preparedData map is empty", () => {
    const emptyPreparedData: PreparedTrackerData = {
      originalList: { trackers: {} },
      normalizedMap: new Map(),
    };
    expect(
      findTrackerInfo("google-analytics.com", emptyPreparedData)
    ).toBeNull();
  });
});
