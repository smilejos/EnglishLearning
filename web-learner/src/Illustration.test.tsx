// @vitest-environment happy-dom
import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CoverImage, Illustration } from "./Illustration";
import type { PublishedImage } from "./types";
afterEach(cleanup);
const image: PublishedImage = {
  id: 1,
  url: "/images/web.webp",
  thumbnailUrl: "/images/card.webp",
  playerUrl: "/images/player.webp",
  altText: "A cat",
  width: 640,
  height: 480,
  focalX: 0.5,
  focalY: 0.5,
  revision: 1,
  teachingTargets: [
    {
      word: "cat",
      normalizedWord: "cat",
      reason: "noun",
      visualObject: "cat",
      anchor: { x: 0.4, y: 0.5 },
      confidence: 1,
      placementSource: "manual",
    },
  ],
};
describe("published images", () => {
  it("preserves the focal point when a cover is cropped into its frame", () => {
    render(
      <CoverImage
        image={{ ...image, focalX: 0.25, focalY: 0.75 }}
        variant="card"
        fallback="🐱"
      />,
    );
    expect((screen.getByRole("img") as HTMLImageElement).style.objectPosition).toBe(
      "25% 75%",
    );
  });
  it("uses each cover variant and returns to emoji after an error", () => {
    const view = render(
      <CoverImage image={image} variant="card" fallback="🐱" />,
    );
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      image.thumbnailUrl,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("🐱")).toBeTruthy();
    view.rerender(
      <CoverImage
        image={{ ...image, thumbnailUrl: "/images/new.webp" }}
        variant="card"
        fallback="🐱"
      />,
    );
    expect(screen.getByRole("img")).toBeTruthy();
  });
  it("keeps labels as buttons, supports hiding, and hides failed figures", () => {
    const onWord = vi.fn();
    render(<Illustration image={image} onWord={onWord} />);
    fireEvent.click(screen.getByRole("button", { name: "查詢 cat" }));
    expect(onWord).toHaveBeenCalledWith("cat");
    fireEvent.click(screen.getByRole("button", { name: "隱藏圖片單字" }));
    expect(screen.queryByRole("button", { name: "查詢 cat" })).toBeNull();
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("renders no figure without an image", () => {
    const { container } = render(
      <Illustration image={null} onWord={() => {}} />,
    );
    expect(container.children).toHaveLength(0);
  });
});
