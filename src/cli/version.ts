import { execSync } from "node:child_process";
import pkg from "../../package.json";

export function getCommitHash(): string {
  if (process.env.AUTOPILOT_COMMIT_HASH) {
    return process.env.AUTOPILOT_COMMIT_HASH.slice(0, 7);
  }
  if (process.env.GIT_COMMIT) {
    return process.env.GIT_COMMIT.slice(0, 7);
  }
  try {
    return execSync(`git -C "${import.meta.dir}" rev-parse --short HEAD`, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
    }).trim();
  } catch {
    return "unknown";
  }
}

export function getVersionInfo(): { version: string; commit: string } {
  return {
    version: pkg.version,
    commit: getCommitHash(),
  };
}

export function cmdVersion(): void {
  const { version, commit } = getVersionInfo();
  console.log(`autopilot ${version} (${commit})`);
}
