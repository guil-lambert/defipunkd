"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  src: string | null;
  name: string;
  size?: number;
};

export function ProtocolLogo({ src, name, size = 20 }: Props) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const initial = name.charAt(0).toUpperCase();

  useEffect(() => {
    setFailed(false);
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth === 0) {
      setFailed(true);
    }
  }, [src]);

  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 4,
        background: "var(--surface-raised)",
        color: "var(--text-muted)",
        fontSize: Math.round(size * 0.55),
        fontWeight: 500,
        flexShrink: 0,
        overflow: "hidden",
        verticalAlign: "middle",
        position: "relative",
      }}
    >
      {initial}
      {src && !failed ? (
        <img
          ref={imgRef}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          onError={() => setFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : null}
    </span>
  );
}
