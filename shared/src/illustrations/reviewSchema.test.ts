import { expect, it } from "vitest";
import { ReviewSchema } from "./repository";

const review = {
  altText: "",
  teachingTargets: [],
  confirmed: true,
};

it("requires alt text for approval but permits rejection without it", () => {
  expect(ReviewSchema.safeParse({ ...review, decision: "approved" }).success).toBe(false);
  expect(ReviewSchema.safeParse({ ...review, decision: "rejected", reason: "主體與故事不符" }).success).toBe(true);
  expect(ReviewSchema.safeParse({ ...review, decision: "rejected", reason: "  " }).success).toBe(false);
});
