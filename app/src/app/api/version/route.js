import https from "https";
import pkg from "../../../../package.json" with { type: "json" };

const GITHUB_RAW_PKG = "https://raw.githubusercontent.com/xscope0/xScope0-Router/main/package.json";

function fetchJson(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 4000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

// Fetch version from GitHub main branch package.json
function fetchGitHubVersion() {
  return new Promise(async (resolve) => {
    const data = await fetchJson(GITHUB_RAW_PKG);
    resolve(data?.version || null);
  });
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

export async function GET() {
  const githubVersion = await fetchGitHubVersion();
  const currentVersion = pkg.version;
  const latestVersion = githubVersion;
  const hasUpdate = githubVersion ? compareVersions(githubVersion, currentVersion) > 0 : false;
  const githubStatus = githubVersion
    ? compareVersions(currentVersion, githubVersion) === 0
      ? "current"
      : compareVersions(currentVersion, githubVersion) > 0
        ? "local_ahead"
        : "github_ahead"
    : null;

  return Response.json({ currentVersion, latestVersion, githubVersion, hasUpdate, githubStatus });
}
