// 測試庫解析與防呆的單元測試（不連任何資料庫）。
import { describe, it, expect } from "vitest";
import {
  resolveTestDatabaseUrl,
  assertTestDatabase,
  DEFAULT_TEST_DATABASE_URL,
} from "./testing";

describe("resolveTestDatabaseUrl", () => {
  it("未設定時採用 5433 測試庫預設值", () => {
    expect(resolveTestDatabaseUrl({})).toBe(DEFAULT_TEST_DATABASE_URL);
  });

  it("空字串／全空白視為未設定", () => {
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: "   " })).toBe(
      DEFAULT_TEST_DATABASE_URL,
    );
  });

  it("可用 TEST_DATABASE_URL 覆寫（仍須為 _test 結尾）", () => {
    const url = "postgres://u:p@db:5432/other_test";
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: url })).toBe(url);
  });

  it("完全不理會 DATABASE_URL——正式庫變數不得影響測試連線", () => {
    expect(
      resolveTestDatabaseUrl({
        DATABASE_URL: "postgres://app:app@localhost:5432/english_learning",
      }),
    ).toBe(DEFAULT_TEST_DATABASE_URL);
  });

  it("TEST_DATABASE_URL 指向正式庫時拒絕執行", () => {
    expect(() =>
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: "postgres://app:app@localhost:5432/english_learning",
      }),
    ).toThrow(/拒絕在非測試資料庫上跑測試/);
  });
});

describe("assertTestDatabase", () => {
  it("資料庫名以 _test 結尾時通過", () => {
    expect(() =>
      assertTestDatabase("postgres://app:app@localhost:5433/english_learning_test"),
    ).not.toThrow();
  });

  it("帶 query string 也能正確取出資料庫名", () => {
    expect(() =>
      assertTestDatabase("postgres://app:app@h:5432/el_test?sslmode=disable"),
    ).not.toThrow();
  });

  it("資料庫名不以 _test 結尾時拋錯，訊息含正確的補救指令", () => {
    expect(() =>
      assertTestDatabase("postgres://app:app@localhost:5432/english_learning"),
    ).toThrow(/npm run test:db:up/);
  });

  it("未指定資料庫名時拋錯", () => {
    expect(() => assertTestDatabase("postgres://app:app@localhost:5433")).toThrow(
      /未指定資料庫名稱/,
    );
  });

  it("非法連線字串拋錯", () => {
    expect(() => assertTestDatabase("not a url")).toThrow(/不是合法的連線字串/);
  });
});
