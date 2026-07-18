import { useState } from "react";
import { spriteUrls } from "../lib/sprites";

export function Sprite({ species, size = 40 }: { species: string; size?: number }) {
  const [srcIdx, setSrcIdx] = useState(0);
  const urls = spriteUrls(species);
  if (srcIdx >= urls.length)
    return <span className="sprite-fallback" style={{ width: size, height: size }} />;
  return (
    <img
      className="sprite"
      src={urls[srcIdx]}
      alt={species}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setSrcIdx(srcIdx + 1)}
    />
  );
}
