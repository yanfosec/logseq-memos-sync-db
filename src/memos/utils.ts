import type { IBatchBlock } from "@logseq/libs/dist/LSPlugin";
import { Mode, Visibility } from "../settings";
import { Memo } from "./type";
import { format } from "date-fns";

const BREAK_LINE = "!!!-!!!";

export const formatContentWhenPush = (content: string) => {
  return content
    .replaceAll(/^-?\S*?TODO /gm, "- [ ] ")
    .replaceAll(/^-?\S*?NOW /gm, "- [ ] ")
    .replaceAll(/^-?\S*?DOING /gm, "- [ ] ")
    .replaceAll(/^-?\S*?DONE /gm, "- [x] ")
    .replaceAll(/\nmemo-id::.*/gm, "")
    .replaceAll(/\nmemoid::.*/gm, "")
    .replaceAll(/\nmemo-visibility::.*/gm, "");
};

// Resolve the timestamp (epoch ms) that a pushed memo should be created with,
// so Memos records the date the block belongs to in Logseq instead of "now".
//
// When the block lives on a journal page we use that journal day (YYYYMMDD),
// combined with the block's own time-of-day so several memos from the same day
// keep their relative ordering. For non-journal pages (no journalDay) we fall
// back to the block's own createdAt. Returns undefined when neither is known,
// which lets the caller omit createTime and leave the server default in place.
export const resolveJournalCreateTime = (
  journalDay: number | undefined,
  blockCreatedAt: number | undefined
): number | undefined => {
  if (journalDay !== undefined && journalDay !== null && !isNaN(journalDay)) {
    const year = Math.floor(journalDay / 10000);
    const month = Math.floor(journalDay / 100) % 100;
    const day = journalDay % 100;
    if (blockCreatedAt === undefined) {
      // No block time available: land at noon local to avoid a timezone
      // rounding pushing the memo onto the neighbouring day.
      return new Date(year, month - 1, day, 12, 0, 0).getTime();
    }
    // Keep the block's local time-of-day, move the calendar date to the
    // journal day. setFullYear operates in local time.
    const d = new Date(blockCreatedAt);
    d.setFullYear(year, month - 1, day);
    return d.getTime();
  }
  return blockCreatedAt;
};

// A minimal shape covering both the BlockEntity tree returned by
// logseq.Editor.getBlock(..., { includeChildren: true }) and plain test
// fixtures. children entries that are UUID tuples (not full blocks) are
// ignored during rendering.
export type MemoBlockNode = {
  content?: string;
  children?: Array<MemoBlockNode | unknown>;
};

// Remove the plugin's own bookkeeping properties from a single block's raw
// content, regardless of which line they appear on (Logseq appends them after
// the visible text on both file and DB graphs).
const stripMemoProperties = (content: string): string =>
  (content || "")
    .replace(/^[ \t]*memo-id::.*$/gim, "")
    .replace(/^[ \t]*memoid::.*$/gim, "")
    .replace(/^[ \t]*memo-visibility::.*$/gim, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// Convert Logseq task markers at the start of a line into Markdown checkboxes
// so they render as checkboxes in Memos at any nesting depth (the /gm regexes
// in formatContentWhenPush only match un-indented lines).
const logseqTodoToMarkdown = (line: string): string =>
  line
    .replace(/^(TODO|NOW|DOING|LATER|WAITING|WAIT|IN-PROGRESS) /, "[ ] ")
    .replace(/^(DONE|CANCELED|CANCELLED) /, "[x] ");

// Render a Logseq block and its full descendant tree into a single Markdown
// document suitable for a Memos memo: the root block's text becomes the top
// lines, and every nested block becomes an indented Markdown bullet (two
// spaces per depth level). This is what lets "/memos" replicate the whole
// outline instead of just the top line.
export const blockTreeToMemoContent = (root: MemoBlockNode): string => {
  const lines: string[] = [];

  const render = (block: MemoBlockNode, depth: number) => {
    const text = stripMemoProperties(block.content || "");
    if (text) {
      const rawLines = text.split("\n").map(logseqTodoToMarkdown);
      if (depth === 0) {
        lines.push(...rawLines);
      } else {
        const indent = "  ".repeat(depth - 1);
        lines.push(`${indent}- ${rawLines[0]}`);
        for (const continuation of rawLines.slice(1)) {
          lines.push(`${indent}  ${continuation}`);
        }
      }
    }
    for (const child of block.children || []) {
      if (child && typeof child === "object" && "content" in child) {
        render(child as MemoBlockNode, depth + 1);
      }
    }
  };

  render(root, 0);
  return lines.join("\n");
};

export const memoContentGenerate = (
  memo: Memo,
  host: string,
  preferredTodo: string,
  withProperties: boolean = false
): IBatchBlock[] => {
  let content = memo.content;
  content = content.replaceAll(/^[-*] /gm, "* ");
  content = content.replaceAll(
    /^\* \[ \](.*)/gm,
    `${BREAK_LINE}${preferredTodo} $1 ${BREAK_LINE}`
  );
  content = content.replaceAll(
    /^\* \[x\](.*)/gm,
    `${BREAK_LINE}DONE $1 ${BREAK_LINE}`
  );
  const result = content.split(BREAK_LINE).filter((item) => !!item.trim());

  const children: IBatchBlock[] = [];
  if (memo.resourceList.length > 0) {
    for (const resource of memo.resourceList) {
      let link;
      if (resource.externalLink) {
        link = resource.externalLink;
      } else if (memo.visibility.toLowerCase() == Visibility.Public.toLowerCase()) {
        link = `${host}/file/attachments/${resource.id}/${resource.filename}`;
      }
      children.push({content: `![${resource.filename}](${link})`});
    }
  }

  return result
    .filter((item) => !!item.trim())
    .map((item) => {
      const data: IBatchBlock = { content: item, properties: {} };
      if (withProperties) {
        data.properties = {
          "memo-id": memo.id,
        };
      }
      data.children = children;
      return data;
    });
};

export const renderMemoParentBlockContent = (
  memo: Memo,
  preferredDateFormat: string,
  mode: Mode
) => {
  const createDate = new Date(memo.createdTs * 1000);
  if (mode === Mode.JournalGrouped) {
    return `${format(createDate, "HH:mm")}`;
  } else if (mode === Mode.Journal) {
    return `${format(createDate, "HH:mm")} #memos`;
  }
  return `[[${format(createDate, preferredDateFormat)}]] ${format(
    createDate,
    "HH:mm"
  )} #memos`;
};
