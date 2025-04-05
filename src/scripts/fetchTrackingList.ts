import fs from "fs";
import path from "path";

// URL for the raw version of the tracker file from DuckDuckGo
const TRACKER_URL =
  "https://raw.githubusercontent.com/duckduckgo/tracker-blocklists/main/web/v6/extension-mv3-tds.json";

// Define where to save the tracker file locally
const DATA_DIR = path.join(__dirname, "..", "data");
const OUTPUT_FILE = path.join(DATA_DIR, "extension-mv3-tds.json");

async function fetchTrackerFile(): Promise<void> {
  try {
    console.log(`Fetching tracker file from ${TRACKER_URL}...`);
    const response = await fetch(TRACKER_URL);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch tracker file: ${response.status} ${response.statusText}`
      );
    }

    const fileContents = await response.text();

    // Ensure the data directory exists.
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, fileContents, "utf-8");
    console.log(`Tracker file saved to ${OUTPUT_FILE}`);
  } catch (error: any) {
    console.error(`Error fetching tracker file: ${error.message}`);
  }
}

fetchTrackerFile();
