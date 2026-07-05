import { describe, expect, it } from "vitest";
import { normalizeBaseUrl } from "./urls";

describe("normalizeBaseUrl", () => {
  it("裸網域自動補 https://", () => {
    expect(normalizeBaseUrl("admin.e-learning.jos.homes")).toBe(
      "https://admin.e-learning.jos.homes",
    );
  });

  it("已含 scheme 者保持原樣（本機 http 開發）", () => {
    expect(normalizeBaseUrl("http://localhost:8081")).toBe(
      "http://localhost:8081",
    );
    expect(normalizeBaseUrl("https://example.com")).toBe("https://example.com");
  });

  it("去除尾端斜線與前後空白", () => {
    expect(normalizeBaseUrl(" https://example.com/ ")).toBe(
      "https://example.com",
    );
    expect(normalizeBaseUrl("example.com///")).toBe("https://example.com");
  });

  it("空字串回傳空字串", () => {
    expect(normalizeBaseUrl("")).toBe("");
    expect(normalizeBaseUrl("  ")).toBe("");
  });
});
