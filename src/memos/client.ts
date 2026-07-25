import MemosClientV1 from "./impls/clientV1";
import { Memo } from "./type";

export type MemoPage = {
  memos: Memo[];
  nextPageToken: string | null;
};

export interface MemosClient {
  getMemos(
    limit: number,
    pageToken: string | null,
    includeArchive: boolean
  ): Promise<MemoPage>;
  updateMemo(memoId: string, payload: Record<string, any>): Promise<Memo>;
  createMemo(content: string, visibility: string): Promise<Memo>;
}

export default class MemosGeneralClient {
  private client: MemosClientV1;

  constructor(host: string, token: string, openId?: string) {
    if (!openId && !token) {
      throw "Token not exist";
    }
    this.client = new MemosClientV1(host, token, openId);
  }

  public async getClient(): Promise<MemosClient> {
    return this.client;
  }
}
