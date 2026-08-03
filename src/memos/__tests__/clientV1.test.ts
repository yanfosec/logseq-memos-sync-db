import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import MemosClientV1 from "../impls/clientV1";

describe("MemosClientV1 host normalization", () => {
  let requestMock: jest.Mock<(req: { url: string }) => Promise<any>>;

  beforeEach(() => {
    requestMock = jest.fn<(req: { url: string }) => Promise<any>>();
    requestMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: { memos: [], nextPageToken: null },
    });
    (globalThis as any).logseq = {
      Net: { request: requestMock },
      settings: { debug: false },
    };
  });

  const requestedUrl = () => (requestMock.mock.calls[0][0] as { url: string }).url;

  it("strips a trailing slash so the API path has no double slash", async () => {
    const client = new MemosClientV1("https://memos.example.com/", "token");
    await client.getMemos(10, null, false);
    expect(requestedUrl()).not.toContain("//api/v1");
    expect(requestedUrl().startsWith("https://memos.example.com/api/v1/memos")).toBe(true);
  });

  it("strips multiple trailing slashes", async () => {
    const client = new MemosClientV1("https://memos.example.com///", "token");
    await client.getMemos(10, null, false);
    expect(requestedUrl()).not.toContain("//api/v1");
  });

  it("trims surrounding whitespace and adds a scheme to a bare host", async () => {
    const client = new MemosClientV1("  memos.example.com/  ", "token");
    await client.getMemos(10, null, false);
    expect(requestedUrl().startsWith("https://memos.example.com/api/v1/memos")).toBe(true);
  });

  it("leaves a clean host untouched", async () => {
    const client = new MemosClientV1("https://memos.example.com", "token");
    await client.getMemos(10, null, false);
    expect(requestedUrl().startsWith("https://memos.example.com/api/v1/memos")).toBe(true);
  });
});
