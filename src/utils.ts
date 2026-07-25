import type { BlockEntity } from "@logseq/libs/dist/LSPlugin";
import { BackgroundSync } from "./settings";

export const debugLog = (...args: any[]) => {
  if (typeof logseq === "undefined") {
    return;
  }
  const settings: any = logseq.settings;
  if (settings?.debug) {
    console.log(...args);
  }
};

export const sleep = (waitSec: number): Promise<void> => {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve();
    }, waitSec);
  });
};

export const tagFilterList = (tagFilter: string): Array<string> => {
  if (tagFilter && tagFilter.trim()) {
    return tagFilter!
      .split("|")
      .map((item) => `#${item.trim()}`)
      .filter((item) => item !== "#");
  }
  return [];
};

export const timeSpentByConfig = (word: string): number => {
  switch (word) {
    case BackgroundSync.Minutely:
      return 60 * 1000;
    case BackgroundSync.Hourly:
      return 60 * 60 * 1000;
    case BackgroundSync.HalfHourly:
      return 30 * 60 * 1000;
    case BackgroundSync.BiHourly:
      return 2 * 60 * 60 * 1000;
    default:
      return 60 * 60 * 1000;
  }
};

// Best-effort legacy lookup for memos that were synced before the
// FileStorage-backed index (below) existed. On DB graphs, properties set via
// upsertBlockProperty are namespaced under :plugin.property._api and are NOT
// guaranteed to be found by this DSL query — this is a compatibility bridge
// for pre-upgrade file-graph data, not something to rely on going forward.
export const searchExistsMemoLegacy = async (
  memoId: string
): Promise<BlockEntity | null> => {
  const safeId = String(memoId).replace(/"/g, "");
  try {
    const memo_blocks: BlockEntity[] | null = await logseq.DB.q(
      `(or (property memoid "${safeId}") (property memo-id "${safeId}"))`
    );
    if (memo_blocks && memo_blocks.length > 0) {
      return memo_blocks[0];
    }
  } catch (error) {
    debugLog("memos-sync: legacy DB.q lookup failed, ignoring:", error);
  }
  return null;
};

// Authoritative sync-dedup index, stored in the plugin's own file storage —
// independent of Logseq's graph model (works the same on file and DB
// graphs), unlike a DSL property query.
const SYNCED_MEMOS_STORAGE_KEY = "synced-memos.json";

export type SyncedMemoIndex = Record<string, string>;

export const loadSyncedMemoIndex = async (): Promise<SyncedMemoIndex> => {
  try {
    const raw = await logseq.FileStorage.getItem(SYNCED_MEMOS_STORAGE_KEY);
    if (!raw) return {};
    if (typeof raw === "string") return JSON.parse(raw);
    if (typeof raw === "object") return raw as SyncedMemoIndex;
  } catch (error) {
    console.error("memos-sync: Failed to load synced memo index:", error);
  }
  return {};
};

export const saveSyncedMemoIndex = async (index: SyncedMemoIndex) => {
  await logseq.FileStorage.setItem(SYNCED_MEMOS_STORAGE_KEY, JSON.stringify(index));
};

export const getMemoId = (properties: Record<string, any>): string | null => {
  if (!properties) {
    return null;
  }
  const memoId = properties["memoId"] || properties["memoid"];
  if (memoId) {
    return String(memoId);
  }
  return null;
};

export const saveSyncStatus = async (lastSyncTimestamp: number) => {
  debugLog("memos-sync: Saving sync status - lastSyncTimestamp:", lastSyncTimestamp);
  await logseq.updateSettings({
    syncStatus: { lastSyncTimestamp },
  });
};

export const fetchSyncStatus = async (): Promise<{ lastSyncTimestamp: number }> => {
  try {
    const settings: any = logseq.settings;
    if (settings?.syncStatus && typeof settings.syncStatus.lastSyncTimestamp === "number") {
      return settings.syncStatus;
    }
    return { lastSyncTimestamp: 0 };
  } catch (error) {
    console.error("memos-sync: Error fetching sync status:", error);
    return { lastSyncTimestamp: 0 };
  }
};
