// src/components/StillImage.tsx
// Preloads an image fully (decodes off-screen) before displaying it.

import React, { useEffect, useRef, useState } from "react";

export default function StillImage({ url }: { url: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (!url) return;

    const img = new Image();
    img.src = url;

    const show = () => {
      if (imgRef.current) {
        imgRef.current.src = url;
        imgRef.current.classList.remove("studio-output-media--loading");
      }
      setReady(true);
    };

    if (typeof img.decode === "function") {
      img.decode().then(show).catch(show);
    } else {
      img.onload = show;
      img.onerror = show;
    }
  }, [url]);

  return (
    <img
      ref={imgRef}
      className={`studio-output-media${ready ? "" : " studio-output-media--loading"}`}
      src={ready ? url : ""}
      alt=""
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
    />
  );
}
