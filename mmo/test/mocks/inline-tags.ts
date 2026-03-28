export type DirectiveType = "expr" | "pose" | "lip" | "cam" | "wait";

export interface Directive {
  type: DirectiveType;
  value: string;
  param?: string;
}

interface TextSegment { kind: "text"; text: string; }
interface DirectiveSegment { kind: "directive"; directive: Directive; }
export type Segment = TextSegment | DirectiveSegment;

function parseTag(content: string): Directive | null {
  if (content === "t") return { type: "lip", value: "talk" };
  if (content === "w") return { type: "lip", value: "whisper" };
  if (content === "s") return { type: "lip", value: "shout" };
  if (content === "click") return { type: "wait", value: "click" };
  if (content.startsWith("e:")) return { type: "expr", value: content.slice(2) };
  if (content.startsWith("p:")) return { type: "pose", value: content.slice(2) };
  if (content.startsWith("cam:")) {
    const parts = content.slice(4).split(":");
    return { type: "cam", value: parts[0], param: parts[1] };
  }
  if (content.startsWith("wait:")) return { type: "wait", value: content.slice(5) };
  return null;
}

export function parseInlineText(raw: string): Segment[] {
  const segments: Segment[] = [];
  let textBuf = "";
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "[") {
      const end = raw.indexOf("]", i + 1);
      if (end !== -1) {
        const directive = parseTag(raw.slice(i + 1, end));
        if (directive) {
          if (textBuf) { segments.push({ kind: "text", text: textBuf }); textBuf = ""; }
          segments.push({ kind: "directive", directive });
          i = end + 1;
          continue;
        }
      }
    }
    textBuf += raw[i];
    i++;
  }
  if (textBuf) segments.push({ kind: "text", text: textBuf });
  return segments;
}

export function stripTags(raw: string): string {
  return parseInlineText(raw)
    .filter((s): s is TextSegment => s.kind === "text")
    .map(s => s.text)
    .join("");
}

export function extractDirectives(raw: string): Directive[] {
  return parseInlineText(raw)
    .filter((s): s is DirectiveSegment => s.kind === "directive")
    .map(s => s.directive);
}
