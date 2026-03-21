# Autotracko

Autotracko is a command-line tool designed to automate the process of scanning websites to identify third-party trackers. It helps researchers, developers, and privacy advocates understand the tracking landscape of specific websites.

## Features

- **Automated Scanning:** Scans a list of URLs using Puppeteer.
- **Tracker Identification:** Identifies network requests matching known tracker domains from lists like DuckDuckGo Tracker Radar.
- **Data Collection:** Collects information about loaded resources, approximate page size, and takes screenshots.
- **Caching:** Remembers successfully scanned domains to avoid redundant work (can be disabled).
- **Incremental Results:** Saves results progressively, so work isn't lost if the process is interrupted.
- **Configurable:** Options for input/output files, caching, tracker list location, and headless browser mode.
- **Clear Processing Pipeline:** Scanning, normalization, and analytics are separated so each step is easier to test and reason about.
- **Access-State Detection:** Marks blocked and restricted pages so they are not mistaken for genuine zero-tracker results.

## Data Pipeline

Autotracko uses a two-stage pipeline:

1. **Scanning stage:** Browser automation collects page requests, size estimates, screenshots, and detected trackers.
2. **Processing stage:** Normalization rewrites the collected scan data into the results format used by analytics.

This separation keeps browser work isolated from the data-processing code.

## High-Level Results

Running Autotracko on a list of websites produces a normalized JSON output file with:

- **Basic Info:** Requested URL, final URL (after redirects), domain name, scan timestamp.
- **Access State:** `accessStatus`, `accessReason`, optional `httpStatus`, and `pageTitle` to capture bot blocks, access denials, paywalls, and similar restrictions.
- **Size:** An approximate total size (in bytes) of loaded resources based on `content-length` headers.
- **Screenshot:** Path to a full-page screenshot of the rendered website (if enabled).
- **Trackers (Normalized):**
  - `scanResults[].trackerDomains`: tracker domains referenced by each site.
  - `allTrackers`: deduplicated map of tracker metadata shared across all sites in the run.
- **Errors:** Any thrown errors encountered during the scan for a specific site.

`allTrackers` is not redundant with `trackerDomains`: it removes repeated metadata storage when the same tracker appears on multiple websites.

This data allows for analysis of tracking prevalence, identification of specific tracking companies, and understanding resource loading patterns across different websites.

Generated artifacts are written to `results/` by default. Each scan run gets its own subdirectory such as `results/2026-03-15_16-04-00/results.json`, while the shared cache lives at `results/cache.json`.
Screenshot filenames are stable per final URL within a run directory.

## Setup

1.  **Prerequisites:**

    - [Node.js](https://nodejs.org/) (Version 16+)

2.  **Clone Repository:**

    ```bash
    git clone https://github.com/Rebreda/autotracko.git
    cd autotracko
    ```

3.  **Install Dependencies:**

    ```bash
    npm install
    ```

4.  **Fetch Tracker List:**

    ```bash
    npm run fetch-trackers
    ```

    This pulls down the latest tracker list from github.

5.  **Prepare Domains JSON:** Create a JSON file (e.g., `domains.json` in the project root) containing an array of objects, where each object represents a website to scan. You can `cp example.domains.json domains.json` to get started quickly.

6.  **Validate/Format Domains JSON (Optional but recommended):**

  ```bash
  npm run domains:check
  npm run domains:fix
  ```

  Use `domains:check` to validate structure and catch duplicates. Use `domains:fix` to rewrite the file with consistent formatting and key order.

    _Example `domains.json`:_

    ```json
    [
      {
        "url": "https://www.cbc.ca/news",
        "owner": {
          "name": "Canadian Broadcasting Corporation",
          "displayName": "CBC",
          "country": "CA"
        },
        "category": "News",
        "language": "en"
      },
      {
        "url": "https://www.wikipedia.org",
        "owner": {
          "name": "Wikimedia Foundation",
          "displayName": "Wikipedia",
          "country": "US"
        },
        "category": "Reference",
        "language": "mul"
      },
      {
        "url": "developer.mozilla.org",
        "owner": {
          "name": "Mozilla Corporation",
          "displayName": "MDN",
          "country": "US"
        },
        "category": "Technology",
        "language": "en"
      }
    ]
    ```

    - **`url` (string):** Mandatory. The URL to scan. If no scheme (`http://` or `https://`) is provided, `https://` will be prepended.
    - **`owner` (object, optional):** Information about the website owner.
      - `name` (string): Full name of the owner.
      - `displayName` (string, optional): Common name or abbreviation.
      - `country` (string, optional): ISO 3166-1 alpha-2 country code (e.g., "CA", "US").
    - **`category` (string, optional):** A category for the website (e.g., "News", "E-commerce").
    - **`language` (string, optional):** Primary language code (e.g., "en", "fr").

## Usage

Run the scanner using Node.js (via `ts-node` for development or after building with `tsc`).

**Basic Usage:**

```bash
# Using ts-node (for development)
npx ts-node src/index.ts --domains domains.json
```

Default output path is `results/<run-id>/results.json`, so `--output` is optional unless you want a custom location.

### After building (npm run build)

`node dist/index.js --domains domains.json`

Using npm/yarn script:

### Ensure domains.json exists

`npm run scan -- --domains domains.json`

### or

`yarn scan --domains domains.json`

(Note the extra -- when passing arguments via npm run)

Command-Line Options:

    -d, --domains <path>: Path to the text file containing URLs to scan (default: domains.json).
    -o, --output <path>: Path to the output JSON file for results (default: results/<run-id>/results.json).
    -c, --cache <path>: Path to the cache file (default: results/cache.json). Caching is enabled by default.
    --no-cache: Disables reading from or writing to the cache file.
    -t, --tracker-list <path>: Path to the tracker list JSON file (default: src/data/extension-mv3-tds.json).
    --headless <mode>: Run browser headless ('new', 'true', 'false') (default: 'new'). Use 'false' to see the browser window.
    --no-tracker-catalog: Omit `allTrackers` from output for smaller files (analytics requires tracker catalog, so keep default for analytics runs).
    -h, --help: Display help information.

Example with Options:

```bash
npx ts-node src/index.ts \
 --domains ./input/my_sites.txt \
 --output ./output/scan_run_1.json \
 --no-cache \
 --headless false
```

## Contributing

Contributions are welcome! If you find a bug or have an idea for an improvement, please:

    Open an Issue: Discuss the change you wish to make via a GitHub issue.
    Fork the Repository: Create your own copy of the project.
    Create a Branch: Make your changes in a dedicated branch (git checkout -b feature/your-feature-name).
    Commit Changes: Make clear, concise commits.
    Push Branch: Push your changes to your fork (git push origin feature/your-feature-name).
    Open a Pull Request: Submit a PR back to the main repository for review.

Please ensure your code adheres to the existing style and includes tests if applicable.

## License

The code for Autotracko is licensed under the Mozilla Public License Version 2.0 (MPL-2.0). You can find the full license text in the [LICENSE](./LICENSE.md) file.

Please see the [ACKNOWLEDGEMENTS.md](./ACKNOWLEDGEMENTS.md) file for information regarding the licenses of dependencies and data sources.
