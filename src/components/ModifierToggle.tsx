/** Crit/Doubles-style pill toggle, shared by the calc dialog and both
 * readiness matrix tabs so the look and active-state logic can't drift
 * between the three places it's used. */
export function ModifierToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={"st-btn crit-toggle" + (active ? " active" : "")}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
