"use client";

import { useState } from "react";

type Props = {
  slug: string;
  name: string;
  size?: number;
};

export function ProtocolLogo({ slug, name, size = 20 }: Props) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const initial = name.charAt(0).toUpperCase();
  const src =
    step === 0
      ? `https://icons.llama.fi/${slug}.png`
      : step === 1
        ? `https://icons.llama.fi/${slug}.jpg`
        : null;
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
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          onError={() => setStep((s) => (s === 0 ? 1 : 2))}
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
