"use client";

import { useState } from "react";

interface LogoImageProps {
  src: string;
}

export function LogoImage({ src }: LogoImageProps) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #166534, #15803d)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          flexShrink: 0,
        }}
      >
        🏫
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      onError={() => setErrored(true)}
      style={{
        width: 56,
        height: 56,
        borderRadius: "50%",
        objectFit: "cover",
        border: "2px solid #d1fae5",
        flexShrink: 0,
      }}
    />
  );
}
