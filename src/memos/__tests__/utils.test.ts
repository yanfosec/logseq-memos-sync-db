import "@logseq/libs";
import { describe, it, expect } from "@jest/globals";
import {
  memoContentGenerate,
  blockTreeToMemoContent,
  resolveJournalCreateTime,
} from "../utils";
import { Memo } from "../type";

describe("logseq block tree to memo content (push)", () => {
  it("renders the top block only when there are no children", () => {
    const res = blockTreeToMemoContent({ content: "just one line", children: [] });
    expect(res).toBe("just one line");
  });

  it("replicates nested children as indented markdown bullets", () => {
    const res = blockTreeToMemoContent({
      content: "parent note",
      children: [
        { content: "child one", children: [{ content: "grandchild" }] },
        { content: "child two" },
      ],
    });
    expect(res).toBe(
      ["parent note", "- child one", "  - grandchild", "- child two"].join("\n")
    );
  });

  it("strips the plugin's own bookkeeping properties from every block", () => {
    const res = blockTreeToMemoContent({
      content: "parent\nmemo-id:: abc123\nmemo-visibility:: PRIVATE",
      children: [{ content: "child\nmemo-id:: def456" }],
    });
    expect(res).toBe(["parent", "- child"].join("\n"));
  });

  it("converts logseq task markers to markdown checkboxes at any depth", () => {
    const res = blockTreeToMemoContent({
      content: "TODO top task",
      children: [{ content: "DONE nested task" }],
    });
    expect(res).toBe(["[ ] top task", "- [x] nested task"].join("\n"));
  });

  it("ignores uuid-tuple children that are not full blocks", () => {
    const res = blockTreeToMemoContent({
      content: "parent",
      children: [["uuid", "abc"] as unknown, { content: "real child" }],
    });
    expect(res).toBe(["parent", "- real child"].join("\n"));
  });
});

describe("memos to logseq format", () => {
  it("code body should have nothing changed", () => {
    const codeBody = `
\`\`\`python

def hello():
    return "world"

\`\`\`
`;
    const memo: Memo = {
      content: codeBody,
      id: "0",
      rowStatus: "NORMAL",
      updatedTs: 0,
      visibility: "PUBLIC",
      displayTs: 0,
      createdTs: 0,
      creatorId: 1,
      pinned: false,
      creatorName: "eindex",
      creatorUsername: "eindex",
      resourceList: [],
      relationList: [],
    };

    const res = memoContentGenerate(memo, "host", "TODO");
    expect(res[0]["content"]).toBe(codeBody);
  });

  it("public resources could rending without openId", () => {
    const memo: Memo = {
      id: "1",
      rowStatus: "NORMAL",
      creatorId: 1,
      createdTs: 1690045876,
      updatedTs: 1690079500,
      displayTs: 1690045876,
      content: "test",
      visibility: "PUBLIC",
      pinned: false,
      creatorName: "eindex",
      creatorUsername: "eindex",
      resourceList: [
        {
          id: "1",
          createdTs: 1690079497,
          updatedTs: 1690079497,
          filename: "memos.png",
          externalLink: "",
          type: "image/png",
          size: 1539508,
        },
      ],
      relationList: [],
    };

    const res = memoContentGenerate(memo, "host", "TODO");
    expect(res[0].children?.length).toBe(1);
    expect(res[0].children![0].content).toBe(
      "![memos.png](host/file/attachments/1/memos.png)"
    );
  });

  it("private resources have external link should using external link", () => {
    const memo: Memo = {
      id: "1",
      rowStatus: "NORMAL",
      creatorId: 1,
      createdTs: 1690045876,
      updatedTs: 1690079500,
      displayTs: 1690045876,
      content: "test",
      visibility: "PRIVATE",
      pinned: false,
      creatorName: "eindex",
      creatorUsername: "eindex",
      resourceList: [
        {
          id: "1",
          createdTs: 1690079497,
          updatedTs: 1690079497,
          filename: "memos.png",
          externalLink: "link",
          type: "image/png",
          size: 1539508,
        },
      ],
      relationList: [],
    };

    const res = memoContentGenerate(memo, "host", "TODO");
    expect(res[0].children?.length).toBe(1);
    expect(res[0].children![0].content).toBe("![memos.png](link)");
  });

  it("public resources have external link should using external link", () => {
    const memo: Memo = {
      id: "1",
      rowStatus: "NORMAL",
      creatorId: 1,
      createdTs: 1690045876,
      updatedTs: 1690079500,
      displayTs: 1690045876,
      content: "test",
      visibility: "PUBLIC",
      pinned: false,
      creatorName: "eindex",
      creatorUsername: "eindex",
      resourceList: [
        {
          id: "1",
          createdTs: 1690079497,
          updatedTs: 1690079497,
          filename: "memos.png",
          externalLink: "link",
          type: "image/png",
          size: 1539508,
        },
      ],
      relationList: [],
    };

    const res = memoContentGenerate(memo, "host", "TODO");
    expect(res[0].children?.length).toBe(1);
    expect(res[0].children![0].content).toBe("![memos.png](link)");
  });
});

describe("resolveJournalCreateTime (push timestamp)", () => {
  it("uses the journal page date with the block's time-of-day", () => {
    // Block object was created Jun 20 2024 at 09:30 local time, but it lives
    // on the Jan 15 2024 journal page. The memo should be stamped Jan 15,
    // keeping the 09:30 local time so intra-day ordering is preserved.
    const blockCreatedAt = new Date(2024, 5, 20, 9, 30, 0).getTime();
    const ts = resolveJournalCreateTime(20240115, blockCreatedAt);
    const d = new Date(ts!);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0); // January
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });

  it("falls back to the block's own createdAt when the page is not a journal", () => {
    const blockCreatedAt = new Date(2024, 5, 20, 9, 30, 0).getTime();
    expect(resolveJournalCreateTime(undefined, blockCreatedAt)).toBe(
      blockCreatedAt
    );
  });

  it("returns undefined when no date information is available", () => {
    expect(resolveJournalCreateTime(undefined, undefined)).toBeUndefined();
  });
});
