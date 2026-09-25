import { useState } from "react";
import type { PublishedImage } from "./types";
const imageUrl = (url: string) =>
  `${import.meta.env.VITE_API_BASE ?? ""}${url}`;

export function CoverImage({
  image,
  variant = "hero",
  fallback,
}: {
  image?: PublishedImage | null;
  variant?: "hero" | "card" | "player";
  fallback: string;
}) {
  const [failedUrl, setFailedUrl] = useState("");
  const url =
    image &&
    (variant === "card"
      ? image.thumbnailUrl
      : variant === "player"
        ? image.playerUrl
        : image.url);
  if (!image || !url || url === failedUrl) return <>{fallback}</>;
  return (
    <img
      className="ai-cover"
      style={{ objectPosition: `${image.focalX * 100}% ${image.focalY * 100}%` }}
      src={imageUrl(url)}
      width={image.width}
      height={image.height}
      alt={image.altText}
      loading={variant === "hero" ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailedUrl(url)}
    />
  );
}

export function Illustration({
  image,
  onWord,
}: {
  image?: PublishedImage | null;
  onWord: (word: string) => void;
}) {
  const [failedUrl, setFailedUrl] = useState("");
  const [showWords, setShowWords] = useState(true);
  if (!image || image.url === failedUrl) return null;
  return (
    <figure className="paragraph-illustration">
      <div className="paragraph-illustration__image">
        <img
          src={imageUrl(image.url)}
          alt={image.altText}
          width={image.width}
          height={image.height}
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(image.url)}
        />
        {showWords &&
          image.teachingTargets.map((t) => (
            <button
              key={t.normalizedWord}
              className="illustration-word"
              style={{
                left: `${t.anchor.x * 100}%`,
                top: `${t.anchor.y * 100}%`,
                transform: `translate(-${t.anchor.x * 100}%, -${t.anchor.y * 100}%)`,
              }}
              onClick={() => onWord(t.word)}
              aria-label={`查詢 ${t.word}`}
            >
              {t.word}
            </button>
          ))}
      </div>
      {!!image.teachingTargets.length && (
        <button
          className="tr-toggle"
          aria-pressed={showWords}
          onClick={() => setShowWords(!showWords)}
        >
          {showWords ? "隱藏圖片單字" : "顯示圖片單字"}
        </button>
      )}
    </figure>
  );
}
