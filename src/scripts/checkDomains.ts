import fs from "fs";
import path from "path";
import { URL } from "url";
import { Command } from "commander";
import { DomainInputEntry } from "../types";

interface CheckResult {
  errors: string[];
  warnings: string[];
}

const program = new Command();

program
  .name("check-domains")
  .description("Validate and optionally format domains JSON file")
  .option("-f, --file <path>", "Path to domains JSON", "domains.json")
  .option("--fix", "Rewrite file with consistent formatting and key order")
  .action((options) => {
    const filePath = path.resolve(process.cwd(), options.file as string);

    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: Invalid JSON in ${filePath}: ${message}`);
      process.exit(1);
    }

    if (!Array.isArray(parsed)) {
      console.error("Error: domains file must contain a top-level JSON array.");
      process.exit(1);
    }

    const data = parsed as DomainInputEntry[];
    const result = checkDomains(data);

    if (options.fix) {
      const normalized = normalizeDomainsForOutput(data);
      fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
      console.log(`Formatted ${normalized.length} entries in ${filePath}.`);
    }

    if (result.warnings.length > 0) {
      console.log("\nWarnings:");
      for (const warning of result.warnings) {
        console.log(`  - ${warning}`);
      }
    }

    if (result.errors.length > 0) {
      console.error("\nErrors:");
      for (const error of result.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }

    console.log("\nDomain file check passed.");
  });

const normalizeUrlForComparison = (rawUrl: string): string => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl.trim().toLowerCase();
  }

  const protocol = url.protocol.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return `${protocol}//${hostname}${pathname}${url.search}`;
};

const isLikelyLanguageCode = (value: string): boolean => {
  return /^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(value);
};

const isIsoCountryCode = (value: string): boolean => {
  return /^[A-Z]{2}$/.test(value);
};

const checkDomains = (domains: DomainInputEntry[]): CheckResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const seenUrls = new Map<string, number>();

  domains.forEach((entry, index) => {
    const position = index + 1;

    if (!entry || typeof entry !== "object") {
      errors.push(`Entry #${position} must be an object.`);
      return;
    }

    if (typeof entry.url !== "string" || entry.url.trim().length === 0) {
      errors.push(`Entry #${position} has missing/invalid url.`);
      return;
    }

    try {
      const parsedUrl = new URL(entry.url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        errors.push(`Entry #${position} URL must use http or https: ${entry.url}`);
      }
    } catch {
      errors.push(`Entry #${position} URL is invalid: ${entry.url}`);
    }

    const normalizedUrl = normalizeUrlForComparison(entry.url);
    if (seenUrls.has(normalizedUrl)) {
      const firstSeen = seenUrls.get(normalizedUrl);
      errors.push(
        `Entry #${position} duplicates URL from entry #${firstSeen}: ${entry.url}`
      );
    } else {
      seenUrls.set(normalizedUrl, position);
    }

    if (entry.owner !== undefined) {
      if (typeof entry.owner !== "object" || entry.owner === null) {
        errors.push(`Entry #${position} owner must be an object when provided.`);
      } else {
        if (typeof entry.owner.name !== "string" || entry.owner.name.trim().length === 0) {
          errors.push(`Entry #${position} owner.name must be a non-empty string.`);
        }

        if (
          entry.owner.displayName !== undefined &&
          (typeof entry.owner.displayName !== "string" ||
            entry.owner.displayName.trim().length === 0)
        ) {
          errors.push(
            `Entry #${position} owner.displayName must be a non-empty string when provided.`
          );
        }

        if (entry.owner.country !== undefined) {
          if (typeof entry.owner.country !== "string") {
            errors.push(`Entry #${position} owner.country must be a string.`);
          } else if (!isIsoCountryCode(entry.owner.country)) {
            warnings.push(
              `Entry #${position} owner.country is not a 2-letter uppercase ISO code: ${entry.owner.country}`
            );
          }
        }
      }
    }

    if (entry.category !== undefined) {
      if (typeof entry.category !== "string" || entry.category.trim().length === 0) {
        errors.push(`Entry #${position} category must be a non-empty string when provided.`);
      }
    }

    if (entry.language !== undefined) {
      if (typeof entry.language !== "string" || entry.language.trim().length === 0) {
        errors.push(`Entry #${position} language must be a non-empty string when provided.`);
      } else if (!isLikelyLanguageCode(entry.language)) {
        warnings.push(
          `Entry #${position} language does not look like a standard language tag: ${entry.language}`
        );
      }
    }
  });

  return { errors, warnings };
};

const normalizeDomainsForOutput = (domains: DomainInputEntry[]): DomainInputEntry[] => {
  return domains.map((entry) => {
    const normalizedEntry: DomainInputEntry = {
      url: entry.url,
    };

    if (entry.owner) {
      normalizedEntry.owner = {
        name: entry.owner.name,
      };

      if (entry.owner.displayName !== undefined) {
        normalizedEntry.owner.displayName = entry.owner.displayName;
      }

      if (entry.owner.country !== undefined) {
        normalizedEntry.owner.country = entry.owner.country;
      }
    }

    if (entry.category !== undefined) {
      normalizedEntry.category = entry.category;
    }

    if (entry.language !== undefined) {
      normalizedEntry.language = entry.language;
    }

    return normalizedEntry;
  });
};

program.parse(process.argv);