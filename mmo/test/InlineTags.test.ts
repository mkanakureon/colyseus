import assert from "assert";
import { parseInlineText, stripTags, extractDirectives, type Segment, type Directive } from "./mocks/inline-tags.ts";

describe("InlineTags", () => {
  // === I-PARSE: Basic parsing ===

  it("I-PARSE-01: should parse expression tag", () => {
    const segments = parseInlineText("[e:smile]こんにちは");
    assert.strictEqual(segments.length, 2);
    assert.deepStrictEqual(segments[0], { kind: "directive", directive: { type: "expr", value: "smile" } });
    assert.deepStrictEqual(segments[1], { kind: "text", text: "こんにちは" });
  });

  it("I-PARSE-02: should parse pose tag", () => {
    const segments = parseInlineText("[p:wave]やあ！");
    assert.strictEqual(segments.length, 2);
    assert.deepStrictEqual(segments[0], { kind: "directive", directive: { type: "pose", value: "wave" } });
  });

  it("I-PARSE-03: should parse click tag", () => {
    const segments = parseInlineText("前半[click]後半");
    assert.strictEqual(segments.length, 3);
    assert.deepStrictEqual(segments[1], { kind: "directive", directive: { type: "wait", value: "click" } });
  });

  it("I-PARSE-04: should parse lip mode tags", () => {
    const talk = parseInlineText("[t]話す");
    assert.deepStrictEqual(talk[0], { kind: "directive", directive: { type: "lip", value: "talk" } });

    const whisper = parseInlineText("[w]ひそひそ");
    assert.deepStrictEqual(whisper[0], { kind: "directive", directive: { type: "lip", value: "whisper" } });

    const shout = parseInlineText("[s]叫ぶ");
    assert.deepStrictEqual(shout[0], { kind: "directive", directive: { type: "lip", value: "shout" } });
  });

  it("I-PARSE-05: should parse camera tag with param", () => {
    const segments = parseInlineText("[cam:shake:strong]揺れた");
    assert.strictEqual(segments.length, 2);
    const dir = (segments[0] as any).directive;
    assert.strictEqual(dir.type, "cam");
    assert.strictEqual(dir.value, "shake");
    assert.strictEqual(dir.param, "strong");
  });

  it("I-PARSE-06: should parse wait tag", () => {
    const segments = parseInlineText("[wait:1000]次");
    assert.strictEqual(segments.length, 2);
    assert.deepStrictEqual(segments[0], { kind: "directive", directive: { type: "wait", value: "1000" } });
  });

  // === I-COMPLEX: Complex patterns ===

  it("I-COMPLEX-01: should parse multiple tags in NPC dialogue", () => {
    const raw = "[e:smile]ようこそ、旅人よ。[click]この村は平和じゃが...[e:serious]北の森には気をつけるのじゃ。";
    const segments = parseInlineText(raw);
    const directives = extractDirectives(raw);

    assert.strictEqual(directives.length, 3); // e:smile, click, e:serious
    assert.strictEqual(directives[0].type, "expr");
    assert.strictEqual(directives[0].value, "smile");
    assert.strictEqual(directives[1].type, "wait");
    assert.strictEqual(directives[1].value, "click");
    assert.strictEqual(directives[2].type, "expr");
    assert.strictEqual(directives[2].value, "serious");
  });

  it("I-COMPLEX-02: should strip all tags cleanly", () => {
    const raw = "[e:smile][p:wave]いらっしゃい！[click]何かお探しかしら？";
    const plain = stripTags(raw);
    assert.strictEqual(plain, "いらっしゃい！何かお探しかしら？");
  });
});
