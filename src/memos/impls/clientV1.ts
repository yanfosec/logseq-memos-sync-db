import { Memo } from "../type";
import { MemosClient, MemoPage } from "../client";
import { debugLog } from "../../utils";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

// Memos resource names look like "memos/<id>" / "attachments/<id>"; the REST
// path and our local identifiers only need the trailing id segment.
const stripResourceName = (name: string): string => name.split("/").pop() || name;

export default class MemosClientV1 implements MemosClient {
  private openId: string | undefined;
  private host: string;
  private token: string;

  constructor(host: string, token: string, openId?: string) {
    // `new URL()` requires a scheme; users commonly enter a bare host:port.
    this.host = /^https?:\/\//.test(host) ? host : `https://${host}`;
    this.token = token;
    this.openId = openId;
  }

  private async request<T>(
    url: URL,
    method: Method,
    payload: any = null
  ): Promise<T> {
    if (this.openId) {
      url.searchParams.append("openId", String(this.openId));
    }
    debugLog("memos-sync: V1 API request - method:", method, "url:", url.toString());

    try {
      // logseq.Net proxies desktop requests through the host process, which
      // avoids the browser CORS restrictions the plugin iframe (origin
      // lsp://logseq.com) is otherwise subject to for cross-origin XHR/fetch.
      const resp = await logseq.Net.request<T>({
        url: url.toString(),
        method,
        body: payload ?? undefined,
        responseType: "json",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      debugLog("memos-sync: V1 API response - status:", resp.status);

      if (!resp.ok) {
        // @ts-ignore
        throw resp.body?.message || `Unexpected status ${resp.status}`;
      }
      return resp.body;
    } catch (error: any) {
      console.error("memos-sync: V1 API request failed:", error);
      if (error?.response) {
        throw error.response.body?.message || error.message;
      }
      throw error?.message || "Cannot connect to memos server";
    }
  }

  private transformMemo(raw: any): Memo {
    const createdTs = Math.floor(new Date(raw.createTime).getTime() / 1000);
    return {
      id: stripResourceName(raw.name),
      content: raw.content,
      createdTs,
      updatedTs: Math.floor(new Date(raw.updateTime).getTime() / 1000),
      // The current Memo Service schema no longer exposes displayTime; fall
      // back to createTime, which is what display ordering used previously.
      displayTs: createdTs,
      rowStatus: raw.state,
      visibility: raw.visibility,
      pinned: raw.pinned || false,
      creatorId: parseInt(String(raw.creator || "").split("/").pop() || "0"),
      creatorName: raw.creator,
      creatorUsername: raw.creator,
      resourceList: (raw.attachments || []).map((attachment: any) => ({
        id: stripResourceName(attachment.name),
        filename: attachment.filename,
        externalLink: attachment.externalLink,
        type: attachment.type,
        size: Number(attachment.size) || 0,
        createdTs: Math.floor(new Date(attachment.createTime).getTime() / 1000),
        updatedTs: Math.floor(new Date(attachment.createTime).getTime() / 1000),
      })),
      relationList: [],
    };
  }

  private async fetchPage(
    state: "NORMAL" | "ARCHIVED",
    pageToken: string | null,
    limit: number
  ): Promise<MemoPage> {
    const url = new URL(`${this.host}/api/v1/memos`);
    url.searchParams.append("pageSize", limit.toString());
    url.searchParams.append("orderBy", "create_time desc");
    url.searchParams.append("state", state);
    if (pageToken) {
      url.searchParams.append("pageToken", pageToken);
    }
    const response = await this.request<any>(url, "GET");
    const memos = (response.memos || []).map((memo: any) => this.transformMemo(memo));
    debugLog("memos-sync: V1 - Retrieved", memos.length, `${state} memos from API`);
    return { memos, nextPageToken: response.nextPageToken || null };
  }

  public async getMemos(
    limit: number,
    pageToken: string | null,
    includeArchive: boolean
  ): Promise<MemoPage> {
    // Verified live against a real Memos server: `state` is a single-value
    // filter (NORMAL | ARCHIVED) with no "all states" wildcard — omitting it
    // or passing STATE_UNSPECIFIED both silently default to NORMAL only. So
    // includeArchive pages through NORMAL first, then ARCHIVED, encoding
    // which phase we're in inside the opaque pageToken we hand back.
    if (!includeArchive) {
      try {
        return await this.fetchPage("NORMAL", pageToken, limit);
      } catch (error) {
        throw new Error(`Failed to get memos, ${error}`);
      }
    }

    let phase: "NORMAL" | "ARCHIVED" = "NORMAL";
    let innerToken: string | null = null;
    if (pageToken) {
      const separatorIndex = pageToken.indexOf(":");
      phase = pageToken.slice(0, separatorIndex) === "ARCHIVED" ? "ARCHIVED" : "NORMAL";
      innerToken = pageToken.slice(separatorIndex + 1) || null;
    }

    try {
      const page = await this.fetchPage(phase, innerToken, limit);
      if (page.nextPageToken) {
        return { memos: page.memos, nextPageToken: `${phase}:${page.nextPageToken}` };
      }
      if (phase === "NORMAL") {
        // NORMAL exhausted mid-call; fall through to ARCHIVED immediately so
        // the sync loop doesn't see a false "no more pages" in between.
        const archivedPage = await this.fetchPage("ARCHIVED", null, limit);
        return {
          memos: [...page.memos, ...archivedPage.memos],
          nextPageToken: archivedPage.nextPageToken ? `ARCHIVED:${archivedPage.nextPageToken}` : null,
        };
      }
      return { memos: page.memos, nextPageToken: null };
    } catch (error) {
      throw new Error(`Failed to get memos, ${error}`);
    }
  }

  public async updateMemo(
    memoId: string,
    payload: Record<string, any>
  ): Promise<Memo> {
    const url = new URL(`${this.host}/api/v1/memos/${memoId}`);
    const updatePayload: Record<string, any> = {};
    const updateMask: string[] = [];

    if (payload.content !== undefined) {
      updatePayload.content = payload.content;
      updateMask.push("content");
    }
    if (payload.visibility !== undefined) {
      updatePayload.visibility = String(payload.visibility).toUpperCase();
      updateMask.push("visibility");
    }
    if (payload.rowStatus === "ARCHIVED") {
      updatePayload.state = "ARCHIVED";
      updateMask.push("state");
    }
    url.searchParams.append("updateMask", updateMask.join(","));

    try {
      const response = await this.request<any>(url, "PATCH", updatePayload);
      return this.transformMemo(response);
    } catch (error) {
      throw new Error(`Failed to update memo, ${error}.`);
    }
  }

  public async createMemo(
    content: string,
    visibility: string,
    createTime?: string
  ): Promise<Memo> {
    const payload: Record<string, any> = {
      content,
      visibility: visibility.toUpperCase(),
    };
    // The Memo.create_time field is OPTIONAL on create; when omitted the
    // server stamps the current time. Passing the block's Logseq date makes
    // Memos record the note under the day it belongs to.
    if (createTime !== undefined) {
      payload.createTime = createTime;
    }
    const url = new URL(`${this.host}/api/v1/memos`);
    try {
      const response = await this.request<any>(url, "POST", payload);
      return this.transformMemo(response);
    } catch (error) {
      throw new Error(`Failed to create memo, ${error}.`);
    }
  }
}
