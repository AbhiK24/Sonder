/**
 * Sonder Auto-Updater
 *
 * Periodically checks GitHub for new versions and can auto-update.
 *
 * Usage:
 *   import { startUpdateChecker } from './updater/index.js';
 *   startUpdateChecker({ onUpdateAvailable: (v) => console.log(`New version: ${v}`) });
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// =============================================================================
// Constants
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '../../../../');
const PACKAGE_JSON = resolve(ROOT_DIR, 'package.json');

const GITHUB_REPO = 'AbhiK24/Sonder';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}`;

// Check every 6 hours by default
const DEFAULT_CHECK_INTERVAL = 6 * 60 * 60 * 1000;

// =============================================================================
// Types
// =============================================================================

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
}

export interface UpdaterConfig {
  /** Check interval in ms (default: 6 hours) */
  checkInterval?: number;

  /** Auto-update without prompting (default: false) */
  autoUpdate?: boolean;

  /** Callback when update is available */
  onUpdateAvailable?: (info: UpdateInfo) => void;

  /** Callback after successful update */
  onUpdateComplete?: (newVersion: string) => void;

  /** Callback on update error */
  onUpdateError?: (error: Error) => void;

  /** Silent mode - no console logs (default: false) */
  silent?: boolean;
}

// =============================================================================
// Version Helpers
// =============================================================================

/**
 * Get current version from package.json
 */
export function getCurrentVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Parse semver version string
 */
function parseVersion(version: string): [number, number, number] {
  const clean = version.replace(/^v/, '');
  const parts = clean.split('.').map(n => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Compare two versions: returns 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);

  if (aMajor !== bMajor) return aMajor > bMajor ? 1 : -1;
  if (aMinor !== bMinor) return aMinor > bMinor ? 1 : -1;
  if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1;
  return 0;
}

// =============================================================================
// GitHub API
// =============================================================================

/**
 * Fetch latest release from GitHub
 */
async function fetchLatestRelease(): Promise<{
  version: string;
  url: string;
  notes?: string;
  publishedAt?: string;
} | null> {
  try {
    // Try releases first
    const releaseRes = await fetch(`${GITHUB_API}/releases/latest`, {
      headers: { 'User-Agent': 'Sonder-Updater' },
    });

    if (releaseRes.ok) {
      const data = await releaseRes.json() as any;
      return {
        version: data.tag_name?.replace(/^v/, '') || data.name,
        url: data.html_url,
        notes: data.body,
        publishedAt: data.published_at,
      };
    }

    // Fallback to tags
    const tagsRes = await fetch(`${GITHUB_API}/tags`, {
      headers: { 'User-Agent': 'Sonder-Updater' },
    });

    if (tagsRes.ok) {
      const tags = await tagsRes.json() as any[];
      if (tags.length > 0) {
        const latest = tags[0];
        return {
          version: latest.name?.replace(/^v/, ''),
          url: `https://github.com/${GITHUB_REPO}/releases/tag/${latest.name}`,
        };
      }
    }

    // Fallback to comparing commits
    const commitsRes = await fetch(`${GITHUB_API}/commits/main`, {
      headers: { 'User-Agent': 'Sonder-Updater' },
    });

    if (commitsRes.ok) {
      const commit = await commitsRes.json() as any;
      // Use commit date as pseudo-version indicator
      return {
        version: 'latest',
        url: commit.html_url,
        publishedAt: commit.commit?.committer?.date,
      };
    }

    return null;
  } catch (error) {
    console.error('[Updater] Failed to fetch release info:', error);
    return null;
  }
}

/**
 * Check if local repo is behind remote
 */
async function checkGitStatus(): Promise<{ behind: number; ahead: number } | null> {
  try {
    // Fetch latest
    await execAsync('git fetch origin main', { cwd: ROOT_DIR });

    // Check status
    const { stdout } = await execAsync('git rev-list --left-right --count HEAD...origin/main', {
      cwd: ROOT_DIR,
    });

    const [ahead, behind] = stdout.trim().split(/\s+/).map(n => parseInt(n, 10));
    return { ahead: ahead || 0, behind: behind || 0 };
  } catch {
    return null;
  }
}

// =============================================================================
// Update Check
// =============================================================================

/**
 * Check for updates
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  const currentVersion = getCurrentVersion();

  // Check git status first (more accurate for dev)
  const gitStatus = await checkGitStatus();

  if (gitStatus && gitStatus.behind > 0) {
    // Get latest release info for details
    const release = await fetchLatestRelease();

    return {
      currentVersion,
      latestVersion: release?.version || `${gitStatus.behind} commits behind`,
      hasUpdate: true,
      releaseUrl: release?.url || `https://github.com/${GITHUB_REPO}`,
      releaseNotes: release?.notes,
      publishedAt: release?.publishedAt,
    };
  }

  // Check GitHub releases
  const release = await fetchLatestRelease();

  if (!release) {
    return {
      currentVersion,
      latestVersion: currentVersion,
      hasUpdate: false,
      releaseUrl: `https://github.com/${GITHUB_REPO}`,
    };
  }

  const hasUpdate = release.version !== 'latest'
    ? compareVersions(release.version, currentVersion) > 0
    : false;

  return {
    currentVersion,
    latestVersion: release.version,
    hasUpdate,
    releaseUrl: release.url,
    releaseNotes: release.notes,
    publishedAt: release.publishedAt,
  };
}

// =============================================================================
// Update Execution
// =============================================================================

/**
 * Perform the update
 */
export async function performUpdate(): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[Updater] Starting update...');

    // Pull latest
    console.log('[Updater] Pulling latest changes...');
    await execAsync('git pull origin main', { cwd: ROOT_DIR });

    // Install dependencies
    console.log('[Updater] Installing dependencies...');
    await execAsync('pnpm install', { cwd: ROOT_DIR });

    // Build
    console.log('[Updater] Building...');
    await execAsync('pnpm build', { cwd: ROOT_DIR });

    console.log('[Updater] Update complete! Restart required.');

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Updater] Update failed:', message);
    return { success: false, error: message };
  }
}

// =============================================================================
// Update Checker Service
// =============================================================================

let checkInterval: NodeJS.Timeout | null = null;
let lastCheck: UpdateInfo | null = null;

/**
 * Start periodic update checking
 */
export function startUpdateChecker(config: UpdaterConfig = {}): void {
  const {
    checkInterval: interval = DEFAULT_CHECK_INTERVAL,
    autoUpdate = false,
    onUpdateAvailable,
    onUpdateComplete,
    onUpdateError,
    silent = false,
  } = config;

  const log = silent ? () => {} : console.log.bind(console);

  // Initial check after 30 seconds (let services start first)
  setTimeout(async () => {
    await runCheck();
  }, 30000);

  // Periodic checks
  checkInterval = setInterval(async () => {
    await runCheck();
  }, interval);

  async function runCheck() {
    try {
      log('[Updater] Checking for updates...');
      const info = await checkForUpdates();
      lastCheck = info;

      if (info.hasUpdate) {
        log(`[Updater] Update available: ${info.currentVersion} → ${info.latestVersion}`);
        log(`[Updater] Release: ${info.releaseUrl}`);

        if (onUpdateAvailable) {
          onUpdateAvailable(info);
        }

        if (autoUpdate) {
          log('[Updater] Auto-update enabled, updating...');
          const result = await performUpdate();

          if (result.success) {
            const newVersion = getCurrentVersion();
            log(`[Updater] Updated to ${newVersion}`);
            if (onUpdateComplete) {
              onUpdateComplete(newVersion);
            }
            // Suggest restart
            log('[Updater] Please restart Sonder to apply updates.');
          } else if (onUpdateError) {
            onUpdateError(new Error(result.error));
          }
        }
      } else {
        log(`[Updater] Up to date (v${info.currentVersion})`);
      }
    } catch (error) {
      if (onUpdateError && error instanceof Error) {
        onUpdateError(error);
      }
    }
  }

  log(`[Updater] Started (checking every ${Math.round(interval / 1000 / 60)} minutes)`);
}

/**
 * Stop update checker
 */
export function stopUpdateChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('[Updater] Stopped');
  }
}

/**
 * Get last check result
 */
export function getLastCheckResult(): UpdateInfo | null {
  return lastCheck;
}

/**
 * Force an immediate check
 */
export async function forceCheck(): Promise<UpdateInfo> {
  const info = await checkForUpdates();
  lastCheck = info;
  return info;
}
