import { describe, it, expect } from "vitest";
import { uniqSorted } from "./facets";

describe("uniqSorted", () => {
  it("去重、濾除 null/undefined、排序", () => {
    expect(uniqSorted(["b", null, "a", "b", undefined, "a"])).toEqual(["a", "b"]);
  });
  it("空輸入回空陣列", () => {
    expect(uniqSorted([])).toEqual([]);
  });
});
