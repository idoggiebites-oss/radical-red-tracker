import { Combobox } from "./Combobox";
import { Sprite } from "./Sprite";

/** Combobox specialized for species names — adds a sprite next to each
 * suggestion. Same free-text-plus-suggestions interaction as Combobox,
 * just with icons; see Combobox for why this exists over <input list>. */
export function SpeciesCombobox({
  value,
  onChange,
  options,
  placeholder,
  invalid,
  className,
  autoFocus,
  onBlur,
  onEscape,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  invalid?: boolean;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  onEscape?: () => void;
}) {
  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      invalid={invalid}
      className={"species-combobox" + (className ? ` ${className}` : "")}
      autoFocus={autoFocus}
      onBlur={onBlur}
      onEscape={onEscape}
      renderOption={(s) => (
        <>
          <Sprite species={s} size={22} />
          {s}
        </>
      )}
    />
  );
}
