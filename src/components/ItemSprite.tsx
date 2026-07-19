import { useState } from "react";
import { itemSpriteUrls } from "../lib/itemSprites";

/** Inline held-item icon; renders nothing when the item is unknown, the
 * sprite 404s everywhere, or the name is a "no item" placeholder. */
export function ItemSprite({ name, size = 22 }: { name: string; size?: number }) {
  const [state, setState] = useState({ name, srcIdx: 0 });
  const srcIdx = state.name === name ? state.srcIdx : 0;
  const urls = itemSpriteUrls(name);
  if (srcIdx >= urls.length) return null;
  return (
    <img
      className="item-sprite"
      src={urls[srcIdx]}
      alt=""
      title={name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setState({ name, srcIdx: srcIdx + 1 })}
    />
  );
}
