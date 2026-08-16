import { describe, expect, it } from "vitest";
import { splitUsage } from "./expressionText";

describe("splitUsage", () => {
  it("splits usage and Example when both are present", () => {
    expect(splitUsage("Used to describe comparing things. Example: 'The new model is faster.'"))
      .toEqual({ usage: "Used to describe comparing things.", example: "Example: 'The new model is faster.'" });
  });

  it("returns usage only when there is no Example", () => {
    expect(splitUsage("Used to describe comparing things."))
      .toEqual({ usage: "Used to describe comparing things." });
  });

  it("keeps example only when usage starts with Example", () => {
    expect(splitUsage("Example: 'Just do it.'"))
      .toEqual({ usage: "", example: "Example: 'Just do it.'" });
  });

  it("handles full-width colon and trims whitespace", () => {
    expect(splitUsage("  说明用法：这里演示  Example：'例句'  "))
      .toEqual({ usage: "说明用法：这里演示", example: "Example: '例句'" });
  });
});
