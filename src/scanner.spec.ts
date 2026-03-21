import { detectPageAccess } from "./scanner";

describe("detectPageAccess", () => {
  it("marks HTTP 403 responses as blocked", () => {
    expect(detectPageAccess(403, "Forbidden", "", "https://example.com")).toEqual({
      accessStatus: "blocked",
      accessReason: "HTTP 403 response indicates access was blocked",
    });
  });

  it("marks bot protection pages as blocked from page text", () => {
    expect(
      detectPageAccess(
        200,
        "Just a moment...",
        "Please verify you are human before continuing",
        "https://example.com"
      )
    ).toEqual({
      accessStatus: "blocked",
      accessReason: "Access denied or bot protection page detected",
    });
  });

  it("marks paywall-style pages as restricted", () => {
    expect(
      detectPageAccess(
        200,
        "Subscribe to Continue",
        "Premium content. Sign in to continue reading.",
        "https://example.com"
      )
    ).toEqual({
      accessStatus: "restricted",
      accessReason: "Restricted content page detected",
    });
  });

  it("keeps normal pages as ok", () => {
    expect(
      detectPageAccess(
        200,
        "Example Domain",
        "This domain is for use in illustrative examples.",
        "https://example.com"
      )
    ).toEqual({ accessStatus: "ok" });
  });
});