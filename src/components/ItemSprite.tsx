import { useState } from "react";
import { itemSpriteUrls } from "../lib/itemSprites";
import { knownSpriteIdx, rememberSpriteIdx } from "../lib/spriteResolve";

/** Inline held-item icon; renders nothing when the item is unknown, the
 * sprite 404s everywhere, or the name is a "no item" placeholder. */
export function ItemSprite({ name, size = 22 }: { name: string; size?: number }) {
  const urls = itemSpriteUrls(name);
  const start = knownSpriteIdx("i:" + name, urls.length);
  const [state, setState] = useState({ name, srcIdx: start });
  const srcIdx = state.name === name ? state.srcIdx : start;
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
      onLoad={() => rememberSpriteIdx("i:" + name, srcIdx)}
      onError={() => setState({ name, srcIdx: srcIdx + 1 })}
    />
  );
}
