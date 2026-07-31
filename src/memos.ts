import "@logseq/libs";
import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin";
import { format } from "date-fns";
import { BATCH_SIZE } from "./constants";
import MemosGeneralClient, { MemosClient } from "./memos/client";
import { Memo } from "./memos/type";
import {
  blockTreeToMemoContent,
  formatContentWhenPush,
  memoContentGenerate,
  renderMemoParentBlockContent,
  resolveJournalCreateTime,
} from "./memos/utils";
import { Mode, Visibility } from "./settings";
import {
  sleep,
  tagFilterList,
  timeSpentByConfig,
  searchExistsMemoLegacy,
  loadSyncedMemoIndex,
  saveSyncedMemoIndex,
  SyncedMemoIndex,
  getMemoId,
  fetchSyncStatus,
  saveSyncStatus,
  debugLog,
} from "./utils";

class MemosSync {
  private mode: string | undefined;
  private customPage: string | undefined;
  private memosClient: MemosClient | undefined;
  private includeArchive: boolean | undefined;
  private autoSync: boolean | undefined;
  private backgroundSync: string | undefined;
  private archiveMemoAfterSync: boolean | undefined;
  private inboxName: string | undefined;
  private timerId: ReturnType<typeof setInterval> | undefined;
  private tagFilterList: Array<string> | undefined;
  private flat: boolean | undefined;
  private host: string | undefined;
  private openId: string | undefined;
  private token: string | undefined;

  constructor() {
    this.registerProperties();
    this.parseSetting();
  }

  private registerProperties() {
    // Best-effort: registers memo-id/memo-visibility as real schema
    // properties on DB graphs so they're queryable rather than namespaced
    // under Logseq's internal plugin-property bucket. Safe no-op on older
    // Logseq/@logseq-libs versions that don't have this API.
    const editor: any = logseq.Editor;
    if (typeof editor?.upsertProperty !== "function") {
      return;
    }
    for (const key of ["memo-id", "memo-visibility"]) {
      Promise.resolve(
        editor.upsertProperty(key, { type: "default", cardinality: "one", hide: true })
      ).catch((error: any) => {
        debugLog(`memos-sync: upsertProperty(${key}) failed, ignoring:`, error);
      });
    }
  }

  /**
   * syncMemos
   */
  public async syncMemos(mode = "Manual") {
    debugLog("memos-sync: Starting sync process in mode:", mode);
    const { host, token, openId }: any = logseq.settings;

    if (!host || (!openId && !token)) {
      console.error("memos-sync: Missing required settings");
      logseq.UI.showMsg("Memos Setting up needed.");
      logseq.showSettingsUI();
      return;
    }

    await this.choosingClient();
    if (this.memosClient === undefined || this.memosClient === null) {
      console.error("memos-sync: Failed to initialize Memos client");
      logseq.UI.showMsg("Memos Sync Setup issue", "error");
      return;
    }

    try {
      await this.sync();
      debugLog("memos-sync: Sync completed successfully");
      if (mode !== "Background") {
        logseq.UI.showMsg("Memos Sync Success", "success");
      }
    } catch (e) {
      console.error("memos-sync: Sync failed with error:", e);
      if (mode !== "Background") {
        logseq.UI.showMsg(String(e), "error");
      }
    }
  }

  private async lastSyncTimestamp(): Promise<number> {
    return (await fetchSyncStatus()).lastSyncTimestamp;
  }

  private async saveSyncTimestamp(timestamp: number) {
    await saveSyncStatus(timestamp);
  }

  // Returns the timestamp to resume from, or null if no reset was requested.
  // logseq.settings does not reliably reflect an updateSettings() write on
  // the very next read within the same call chain (it round-trips through
  // the host process), so callers must use this return value directly
  // rather than re-reading lastSyncTimestamp() afterward.
  private async beforeSync(): Promise<number | null> {
    if (logseq.settings?.fullSync === "Agree") {
      logseq.updateSettings({ fullSync: "" });
      await saveSyncStatus(0);
      return 0;
    }
    return null;
  }

  private async sync() {
    const resetTimestamp = await this.beforeSync();

    if (this.memosClient === undefined || this.memosClient === null) {
      await this.choosingClient();
    }

    const lastTimestamp = resetTimestamp !== null ? resetTimestamp : (await this.lastSyncTimestamp()) || 0;
    debugLog("memos-sync: Last sync timestamp:", lastTimestamp);

    const syncedIndex = await loadSyncedMemoIndex();
    let indexDirty = false;

    let newMaxTimestamp = lastTimestamp;
    let pageToken: string | null = null;
    let end = false;
    let totalProcessed = 0;
    let totalInserted = 0;

    while (!end) {
      debugLog("memos-sync: Fetching memos batch - pageToken:", pageToken);
      const { memos, nextPageToken } = await this.memosClient!.getMemos(
        BATCH_SIZE,
        pageToken,
        this.includeArchive!
      );
      debugLog("memos-sync: Retrieved", memos.length, "memos");

      const filteredMemos = this.memosFilter(memos);

      for (const memo of filteredMemos) {
        totalProcessed++;
        if (memo.createdTs <= lastTimestamp && !memo.pinned) {
          debugLog("memos-sync: Reached already synced memo, stopping sync", memo.id);
          end = true;
          break;
        }
        if (memo.createdTs > newMaxTimestamp) {
          newMaxTimestamp = memo.createdTs;
        }
        const alreadySynced =
          !!syncedIndex[memo.id] || !!(await searchExistsMemoLegacy(memo.id));
        if (!alreadySynced) {
          debugLog("memos-sync: Inserting new memo ID:", memo.id);
          const blockUuid = await this.insertMemo(memo);
          syncedIndex[memo.id] = blockUuid;
          indexDirty = true;
          totalInserted++;
          if (
            this.archiveMemoAfterSync &&
            memo.visibility.toLowerCase() === Visibility.Private.toLowerCase()
          ) {
            debugLog("memos-sync: Archiving private memo ID:", memo.id);
            await this.archiveMemo(memo.id);
          }
        } else {
          debugLog("memos-sync: Skipping existing memo ID:", memo.id);
          if (!syncedIndex[memo.id]) {
            syncedIndex[memo.id] = "";
            indexDirty = true;
          }
        }
      }
      if (!nextPageToken || memos.length < BATCH_SIZE) {
        end = true;
        break;
      }
      pageToken = nextPageToken;
    }

    debugLog("memos-sync: Sync complete - processed:", totalProcessed, "inserted:", totalInserted);
    if (indexDirty) {
      await saveSyncedMemoIndex(syncedIndex);
    }
    await this.saveSyncTimestamp(newMaxTimestamp);
  }

  public async autoSyncWhenStartLogseq() {
    await sleep(2000);
    if (this.autoSync) {
      await this.syncMemos();
    }
  }

  private backgroundConfigChange() {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
    if (this.backgroundSync) {
      this.timerId = setInterval(() => {
        this.syncMemos("Background");
      }, timeSpentByConfig(this.backgroundSync));
    }
  }

  private async choosingClient() {
    const { host, token, openId }: any = logseq.settings;
    const client = new MemosGeneralClient(host, token, openId);
    try {
      this.memosClient = await client.getClient();
    } catch (error) {
      console.error("memos-sync: get client error", error);
    }
  }

  public parseSetting() {
    this.configMigrate();
    try {
      const {
        mode,
        customPage,
        includeArchive,
        autoSync,
        backgroundSync,
        inboxName,
        archiveMemoAfterSync,
        tagFilter,
        flat,
        host,
        openId,
        token,
      }: any = logseq.settings;

      this.choosingClient();
      this.mode = mode;
      this.autoSync = autoSync;
      this.customPage = customPage || "Memos";
      this.includeArchive = includeArchive;
      this.backgroundSync = backgroundSync;
      this.archiveMemoAfterSync = archiveMemoAfterSync;
      this.inboxName = inboxName || "#Memos";
      this.tagFilterList = tagFilterList(tagFilter);
      this.flat = flat;
      this.host = host;
      this.openId = openId;
      this.token = token;

      this.backgroundConfigChange();
    } catch (e) {
      console.error("memos-sync: Error parsing settings:", e);
      logseq.UI.showMsg("Memos OpenAPI is not a URL", "error");
    }
  }

  public async post(block: BlockEntity | null, visibility: Visibility) {
    try {
      if (block === null) {
        console.error("memos-sync: block is not exits");
        await logseq.UI.showMsg("block is not exits", "error");
        return;
      }

      // Re-fetch the block with its full descendant tree so "/memos"
      // replicates all nested bullets, not just the top line.
      const fullBlock =
        (await logseq.Editor.getBlock(block!.uuid, {
          includeChildren: true,
        })) || block!;

      const memoId = getMemoId(fullBlock.properties || block!.properties || {});
      const memoContent = blockTreeToMemoContent(fullBlock);
      const memoVisibility = visibility.toUpperCase();

      // Stamp the new memo with the block's Logseq date (the journal day it
      // lives on, or its own createdAt) instead of letting Memos default to
      // the current server time.
      const page = fullBlock.page?.id
        ? await logseq.Editor.getPage(fullBlock.page.id)
        : null;
      const createTimeMs = resolveJournalCreateTime(
        page?.journalDay,
        fullBlock.createdAt
      );
      const createTime =
        createTimeMs !== undefined
          ? new Date(createTimeMs).toISOString()
          : undefined;

      const memo =
        memoId !== null
          ? await this.updateMemos(memoId, memoContent, memoVisibility)
          : await this.postMemo(memoContent, memoVisibility, createTime);

      await logseq.Editor.upsertBlockProperty(block!.uuid, "memo-id", memo.id);
      await logseq.Editor.upsertBlockProperty(
        block!.uuid,
        "memo-visibility",
        memo.visibility
      );

      // Record the pushed memo in the authoritative dedup index so the next
      // pull sync recognises it as already-present and does not re-insert it
      // as a new block (the Logseq -> Memos -> Logseq round-trip duplicate).
      try {
        const syncedIndex = await loadSyncedMemoIndex();
        syncedIndex[memo.id] = block!.uuid;
        await saveSyncedMemoIndex(syncedIndex);
      } catch (indexError) {
        debugLog(
          "memos-sync: failed to record pushed memo in sync index:",
          indexError
        );
      }

      if (memoId !== null) {
        await logseq.UI.showMsg("Update memo success");
      } else {
        await logseq.UI.showMsg("Post memo success");
      }
    } catch (error) {
      console.error("memos-sync: ", error);
      await logseq.UI.showMsg(String(error), "error");
    }
  }

  private memosFilter(memos: Array<Memo>): Array<Memo> {
    if (!memos) {
      return [];
    }
    return memos.filter((memo) => {
      if (this.tagFilterList!.length === 0) {
        return true;
      }
      for (const tagFilter of this.tagFilterList!) {
        if (memo.content.includes(tagFilter)) {
          return true;
        }
      }
      return false;
    });
  }

  private async ensurePage(page: string, isJournal: boolean = false) {
    const pageEntity = await logseq.Editor.getPage(page);
    if (!pageEntity) {
      return await logseq.Editor.createPage(page, {}, { journal: isJournal });
    }
    return pageEntity;
  }

  private async generateParentBlock(
    memo: Memo,
    preferredDateFormat: string
  ): Promise<BlockEntity | PageEntity | null> {
    const opts = {
      properties: {
        "memo-id": memo.id,
      },
    };

    if (this.mode === Mode.CustomPage) {
      if (this.flat) {
        const page = await this.ensurePage(this.customPage!);
        return page;
      }
      const content = renderMemoParentBlockContent(memo, preferredDateFormat, this.mode);
      return await logseq.Editor.appendBlockInPage(
        String(this.customPage),
        content,
        opts
      );
    } else if (this.mode === Mode.Journal) {
      const journalPage = format(
        new Date(memo.createdTs * 1000),
        preferredDateFormat
      );
      if (this.flat) {
        const page = await this.ensurePage(journalPage, true);
        return page;
      }
      const content = renderMemoParentBlockContent(memo, preferredDateFormat, this.mode);
      return await logseq.Editor.appendBlockInPage(
        journalPage,
        content,
        opts
      );
    } else if (this.mode === Mode.JournalGrouped) {
      const journalPage = format(
        new Date(memo.createdTs * 1000),
        preferredDateFormat
      );
      await this.ensurePage(journalPage, true);
      const groupedBlock = await this.checkGroupBlock(
        journalPage,
        String(this.inboxName)
      );
      if (this.flat) return groupedBlock;
      const content = renderMemoParentBlockContent(memo, preferredDateFormat, this.mode);
      return await logseq.Editor.appendBlockInPage(
        groupedBlock.uuid,
        content,
        opts
      );
    } else {
      console.error("memos-sync: Unsupported mode:", this.mode);
      throw "Not Support this Mode";
    }
  }

  private async checkGroupBlock(
    page: string,
    inboxName: string
  ): Promise<BlockEntity | PageEntity> {
    const blocks = (await logseq.Editor.getPageBlocksTree(page)) || [];

    const inboxBlock = blocks.find((block) => {
      return block.content === inboxName;
    });

    if (!inboxBlock) {
      const newInboxBlock = await logseq.Editor.appendBlockInPage(
        page,
        inboxName
      );
      if (!newInboxBlock) {
        throw "Memos: Cannot create new inbox block";
      }
      return newInboxBlock;
    } else {
      return inboxBlock;
    }
  }

  private async insertMemo(memo: Memo): Promise<string> {
    const { preferredDateFormat, preferredTodo } =
      await logseq.App.getUserConfigs();

    const parentBlock = await this.generateParentBlock(
      memo,
      preferredDateFormat
    );
    if (!parentBlock) {
      console.error("memos-sync: Failed to create parent block for memo ID:", memo.id);
      throw "Not able to create parent Block";
    }

    if (!this.host || (!this.openId && !this.token)) {
      throw new Error("Host or OpenId is undefined");
    }

    const batchBlocks = memoContentGenerate(
      memo,
      this.host,
      String(preferredTodo),
      !this.archiveMemoAfterSync &&
        this.flat &&
        memo.visibility.toLowerCase() === Visibility.Private.toLowerCase()
    );

    try {
      await logseq.Editor.insertBatchBlock(
        parentBlock.uuid,
        batchBlocks,
        { sibling: false }
      );
    } catch (error) {
      console.error("memos-sync: Failed to insert batch blocks:", error);
      throw error;
    }
    return parentBlock.uuid;
  }

  private async updateMemos(
    memoId: string,
    content: string,
    visibility: string
  ): Promise<Memo> {
    const payload = {
      content: `${formatContentWhenPush(content)}`,
      visibility: `${visibility}`,
    };
    return await this.memosClient!.updateMemo(memoId, payload);
  }

  private async postMemo(
    content: string,
    visibility: string,
    createTime?: string
  ): Promise<Memo> {
    return await this.memosClient!.createMemo(
      formatContentWhenPush(content),
      visibility,
      createTime
    );
  }

  private async archiveMemo(memoId: string): Promise<Memo> {
    const payload = {
      rowStatus: "ARCHIVED",
    };
    return await this.memosClient!.updateMemo(memoId, payload);
  }

  private configMigrate() {
    // memos v0 -> v1
    const { openAPI, host, openId }: any = logseq.settings;
    if (openAPI && !host && !openId) {
      const memosUrl = new URL(openAPI);
      logseq.updateSettings({
        host: memosUrl.origin,
        openId: memosUrl.searchParams.get("openId"),
        openAPI: null,
      });
    }
  }
}

export default MemosSync;
