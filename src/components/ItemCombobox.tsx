import { Combobox } from "./Combobox";
import { ItemSprite } from "./ItemSprite";
import { ITEM_NAMES } from "../lib/damagecalc";

/** Combobox specialized for held items — adds the item icon next to each
 * suggestion, the same way SpeciesCombobox adds a sprite. Replaces the old
 * native <input list="…"> + <datalist>: that renders almost no suggestion UI
 * on iOS Safari (the reason Combobox exists at all), and an item that only
 * *looks* accepted is worse here than elsewhere, because the engine matches
 * items by exact string and a near-miss silently calculates as no item. */
export function ItemCombobox({
  value,
  onChange,
  placeholder = "Held item",
  invalid,
  className,
  options = ITEM_NAMES,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  className?: string;
  options?: string[];
}) {
  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      invalid={invalid}
      className={"item-combobox" + (className ? ` ${className}` : "")}
      renderOption={(name) => (
        <>
          <ItemSprite name={name} size={22} />
          {name}
        </>
      )}
    />
  );
}
