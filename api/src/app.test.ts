import { afterAll, expect, it } from "vitest";
import { createPool } from "@el/shared";
import { resolveTestDatabaseUrl } from "@el/shared/testing";
import { buildApp } from "./app";

const pool = createPool(resolveTestDatabaseUrl());
afterAll(() => pool.end());

it.each([
  { statusCode: 400, expectedStatus: 400, expectedMessage: "invalid request" },
  { statusCode: 500, expectedStatus: 500, expectedMessage: "internal server error" },
  { statusCode: 700, expectedStatus: 500, expectedMessage: "internal server error" },
])("錯誤處理保留有效4xx並隱藏伺服器錯誤：$statusCode", async ({ statusCode, expectedStatus, expectedMessage }) => {
  const app = buildApp({
    pool,
    config: { cfAccess: null, devAuthBypass: false, devUserEmail: "test@example.com", adminEmails: [] },
  });
  app.get("/audio/test-error", async () => {
    throw Object.assign(new Error("invalid request"), { statusCode });
  });
  try {
    const response = await app.inject("/audio/test-error");
    expect(response.statusCode).toBe(expectedStatus);
    expect(response.json()).toEqual({ error: expectedMessage });
  } finally {
    await app.close();
  }
});
