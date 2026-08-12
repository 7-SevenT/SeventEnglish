import { describe, expect, it } from "vitest";
import { audioWordFromFilename, isSupportedAudioFile, readArticleSource } from "./adminImport";

describe("admin import helpers", () => {
  it("derives the answer from an audio filename", () => {
    expect(audioWordFromFilename("  New York City.MP3 ")).toBe("New York City");
  });

  it("accepts known audio extensions even when browser MIME is empty", () => {
    expect(isSupportedAudioFile(new File(["x"], "word.m4a", { type: "" }))).toBe(true);
    expect(isSupportedAudioFile(new File(["x"], "notes.pdf", { type: "" }))).toBe(false);
  });

  it("reads Markdown/TXT content and rejects unsupported or empty files", async () => {
    await expect(readArticleSource(new File(["# Body"], "body.md"))).resolves.toBe("# Body");
    await expect(readArticleSource(new File([""], "empty.txt"))).rejects.toThrow("empty");
    await expect(readArticleSource(new File(["x"], "article.pdf"))).rejects.toThrow("Markdown");
  });
});
