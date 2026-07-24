import { useEffect, useMemo, useRef, useState } from "react";
import type { Boss, BossMode, CalcTarget, GameMode, Run } from "../types";
import { orderChainInfo, type BossTarget } from "../lib/bossTarget";
import { isEffectivelyOptional, nextRequiredIndex, ROUTE_CHOICES } from "../lib/routeChoice";
import { Sprite } from "../components/Sprite";
import { MonCard } from "../components/MonCard";
import { bossMatchesStarter, rivalStarterFor } from "../lib/starters";
import { nextLevelCap } from "../lib/levelCap";
import { ALL_TYPES, defensiveProfile, typeColor } from "../lib/effectiveness";

export function BossesView({
  modeData,
  mode,
  run,
  updateRun,
  focus,
  onCalc,
}: {
  modeData: BossMode;
  mode: GameMode;
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
  /** cap-pill navigation: jump to this boss team and open it */
  focus?: (BossTarget & { nonce: number }) | null;
  /** opens the dedicated Team → Calculator page with a boss Pokémon prefilled */
  onCalc?: (target: CalcTarget) => void;
}) {
  const [view, setView] = useState<"order" | "teams">("order");
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState(modeData.categories[0]?.name ?? "");

  useEffect(() => {
    if (!focus) return;
    setView("teams");
    setCategory(focus.category);
    setFilter("");
  }, [focus]);

  const levelCap = useMemo(() => nextLevelCap(modeData, run), [run, modeData]);

  const rivalStarter = useMemo(() => rivalStarterFor(run), [run]);

  return (
    <div className="bosses">
      <div className="toolbar">
        <div className="segmented">
          <button
            className={view === "order" ? "active" : ""}
            onClick={() => setView("order")}
          >
            Trainer order &amp; level caps
          </button>
          <button
            className={view === "teams" ? "active" : ""}
            onClick={() => setView("teams")}
          >
            Boss teams
          </button>
        </div>
        <span className="mode-badge">{mode === "hardcore" ? "Hardcore" : "Default"} mode</span>
        {view === "teams" && (
          <>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {modeData.categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className="search"
              placeholder="Filter bosses or Pokémon…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </>
        )}
      </div>

      {view === "order" ? (
        <TrainerOrder modeData={modeData} run={run} updateRun={updateRun} />
      ) : (
        <BossTeams
          modeData={modeData}
          category={category}
          filter={filter}
          levelCap={levelCap}
          rivalStarter={rivalStarter}
          focus={focus}
          onCalc={onCalc}
        />
      )}
    </div>
  );
}

function TrainerOrder({
  modeData,
  run,
  updateRun,
}: {
  modeData: BossMode;
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
}) {
  const order = modeData.trainerOrder;
  const nextIdx = useMemo(() => nextRequiredIndex(order, run), [run, order]);
  const chains = useMemo(() => orderChainInfo(modeData), [modeData]);
  // the cap pill's own number (see levelCap.ts: the highest cap already
  // unlocked by defeated trainers, not just the next row's own listed
  // value — several rows in a row can repeat the same number). Every row
  // from the current frontier onward is a fight you're allowed to take
  // AT this cap even though its own doc entry might list a lower one
  // (e.g. Grunt right after Misty still says "27" even though Misty
  // already unlocked 34) — showing the raw per-row number there read as
  // contradicting the pill sitting right above it. Rows already behind
  // you keep their own historical value; that's a real record of what
  // that specific fight required, not something "current" applies to.
  const capNow = useMemo(() => nextLevelCap(modeData, run), [modeData, run]);
  // per-row displayed cap from the frontier onward: capNow ratcheted
  // forward as later REQUIRED rows introduce a genuinely higher one —
  // NOT a flat floor, or an optional side fight further down the list
  // (e.g. Chuck) would show a *lower* number than required rows already
  // passed above it just because its own raw cap happens to be smaller.
  // Optional rows ride along on whatever's already been reached instead
  // of raising it themselves, same as nextLevelCap()'s own unlocked-cap
  // logic ignores them.
  const displayCaps = useMemo(() => {
    const caps: string[] = order.map((t) => t.levelCap);
    let running = capNow ?? 0;
    for (let i = 0; i < order.length; i++) {
      if (nextIdx < 0 || i < nextIdx) continue;
      const raw = parseInt(order[i].levelCap, 10);
      if (Number.isNaN(raw)) continue;
      if (!isEffectivelyOptional(order[i], run)) running = Math.max(running, raw);
      caps[i] = String(Math.max(raw, running));
    }
    return caps;
  }, [order, nextIdx, capNow, run]);
  // the fork's first entry, wherever it falls in this mode's order — shown
  // as an inline choice card right before it, not just a top-bar popup
  const forkIdx = useMemo(() => order.findIndex((t) => !!t.routeChoice), [order]);

  // completed fights collapse out of the list once there's more than one,
  // for scrollability on a long playthrough — one stays visible so a
  // misclick is always a scroll away from undo. Defaults to whatever's
  // right before the current frontier; tracks whatever was last actually
  // checked/unchecked this session (required or optional, doesn't matter)
  const [showCompleted, setShowCompleted] = useState(false);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const keepVisibleIdx = pinnedIdx ?? (nextIdx > 0 ? nextIdx - 1 : -1);
  const isHidden = (i: number) => !!run?.defeated[i] && i !== keepVisibleIdx;
  const hiddenCount = order.reduce((n, _, i) => n + (isHidden(i) ? 1 : 0), 0);

  const toggleDefeated = (i: number, checked: boolean) => {
    updateRun((r) => ({ ...r, defeated: { ...r.defeated, [i]: checked } }));
    setPinnedIdx(i);
  };

  // keep the highlighted "next" fight centered — undone optional/skipped
  // trainers above it don't hide like completed ones do, so on a long
  // playthrough the frontier can otherwise drift below the fold
  const nextRowRef = useRef<HTMLDivElement>(null);
  const scrolledOnce = useRef(false);
  useEffect(() => {
    nextRowRef.current?.scrollIntoView({
      behavior: scrolledOnce.current ? "smooth" : "auto",
      block: "center",
    });
    scrolledOnce.current = true;
  }, [nextIdx]);

  return (
    <div className="trainer-order">
      {hiddenCount > 0 && (
        <label className="checkbox order-show-completed">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          Show completed ({hiddenCount} hidden)
        </label>
      )}
      {order.map((t, i) => {
        const done = !!run?.defeated[i];
        const optional = isEffectivelyOptional(t, run);
        const hidden = !showCompleted && isHidden(i);
        if (hidden && i !== forkIdx) return null;
        const displayCap = displayCaps[i];
        return (
          <div key={i} className="order-row-wrap">
          {run && i === forkIdx && (
            <RouteForkCard
              current={run.sabrinaRoute}
              onChoose={(route) =>
                updateRun((r) => ({ ...r, sabrinaRoute: route }))
              }
            />
          )}
          {!hidden && (
          <div
            ref={i === nextIdx ? nextRowRef : undefined}
            className={
              "order-row" +
              (done ? " done" : "") +
              (i === nextIdx ? " next" : "") +
              (optional ? " optional" : "")
            }
          >
            {run && (
              <input
                type="checkbox"
                checked={done}
                onChange={(e) => toggleDefeated(i, e.target.checked)}
              />
            )}
            <span className="order-name">
              {t.name}
              {optional && <span className="badge optional">optional</span>}
              {chains.get(i) && (
                <span
                  className="badge chain"
                  title="Fought back-to-back with the trainer above and/or below — no break between the fights"
                >
                  ⛓ back-to-back
                </span>
              )}
            </span>
            <span className="order-loc">{t.location}</span>
            <span className="order-rewards">
              {t.rewards.map((rw) => (
                <span key={rw.label} className="reward-chip" title={rw.text}>
                  🎁 {rw.label}
                </span>
              ))}
            </span>
            <span className="order-cap">{t.levelCap && `cap ${displayCap}`}</span>
          </div>
          )}
          </div>
        );
      })}
    </div>
  );
}

/** inline branch prompt on the Trainer order list itself — the other place
 * (besides the top-bar popup) a player can pick, or change, their route */
function RouteForkCard({
  current,
  onChoose,
}: {
  current?: "east" | "west";
  onChoose: (route: "east" | "west") => void;
}) {
  return (
    <div className="route-fork-card">
      <div className="route-fork-head">
        {current ? (
          <span>
            Taking the <strong>{current === "west" ? "West" : "East"}</strong>{" "}
            route to Fuchsia City
          </span>
        ) : (
          <span>Sabrina's gym forks two ways to Fuchsia City — pick one:</span>
        )}
      </div>
      <div className="route-options">
        {ROUTE_CHOICES.map((r) => (
          <button
            key={r.value}
            className={"route-option" + (current === r.value ? " active" : "")}
            onClick={() => onChoose(r.value)}
          >
            <span className="route-option-label">{r.label}</span>
            <span className="muted">{r.routes}</span>
            <span className="route-option-weather">{r.weather}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BossTeams({
  modeData,
  category,
  filter,
  levelCap,
  rivalStarter,
  focus,
  onCalc,
}: {
  modeData: BossMode;
  category: string;
  filter: string;
  levelCap?: number;
  rivalStarter?: string | null;
  focus?: (BossTarget & { nonce: number }) | null;
  onCalc?: (target: CalcTarget) => void;
}) {
  const q = filter.trim().toLowerCase();
  const cat =
    modeData.categories.find((c) => c.name === category) ??
    modeData.categories[0];
  if (!cat) return null;
  const starterFiltered = cat.bosses.filter((b) =>
    bossMatchesStarter(b.subtitle, rivalStarter ?? null),
  );
  const hiddenVariants = cat.bosses.length - starterFiltered.length;
  const bosses = starterFiltered.filter((b) => {
    if (!q) return true;
    return (
      b.title.toLowerCase().includes(q) ||
      b.subtitle.toLowerCase().includes(q) ||
      b.pokemon.some((m) => m.species.toLowerCase().includes(q))
    );
  });
  return (
    <div className="boss-list">
      {hiddenVariants > 0 && (
        <p className="muted starter-filter-note">
          Hiding {hiddenVariants} rival team{hiddenVariants > 1 ? "s" : ""} for
          other starters (rival has {rivalStarter} in this run).
        </p>
      )}
      {bosses.map((b, i) => (
        <BossCard
          key={i}
          boss={b}
          levelCap={levelCap}
          onCalc={onCalc}
          // starter variants share a title — focus only the first one shown
          focusNonce={
            focus && b.title === focus.title && bosses.findIndex((x) => x.title === focus.title) === i
              ? focus.nonce
              : 0
          }
        />
      ))}
      {bosses.length === 0 && <p className="muted">No bosses match.</p>}
    </div>
  );
}

function BossCard({
  boss,
  levelCap,
  onCalc,
  focusNonce = 0,
}: {
  boss: Boss;
  levelCap?: number;
  onCalc?: (target: CalcTarget) => void;
  /** non-zero when cap-pill navigation targets this card: open and scroll to it */
  focusNonce?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusNonce) return;
    setOpen(true);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusNonce]);
  return (
    <div className="boss-card" ref={ref}>
      <button className="boss-head" onClick={() => setOpen(!open)}>
        <span className="boss-title">
          {boss.title}
          {boss.subtitle && <span className="boss-subtitle">{boss.subtitle}</span>}
        </span>
        <span className="boss-preview">
          {boss.pokemon.map((m, i) => (
            <Sprite key={i} species={m.species} size={30} />
          ))}
        </span>
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>
      {(boss.battleEffect || boss.chained || boss.chainedNext) && (
        <div className="effect-row">
          {boss.battleEffect && (
            <span className="battle-effect">⚡ {boss.battleEffect}</span>
          )}
          {(boss.chained || boss.chainedNext) && (
            <span
              className="chain-badge"
              title="Fought back-to-back with the previous team — no healing between the fights"
            >
              ⛓ back-to-back
            </span>
          )}
        </div>
      )}
      {boss.rewards.length > 0 && (
        <div className="boss-rewards">
          {boss.rewards.map((r) => (
            <span key={r.label} className="reward-chip" title={r.text}>
              🎁 {r.label}
            </span>
          ))}
        </div>
      )}
      {open && (
        <>
          {boss.rewards.map((r) => (
            <div key={r.label} className="boss-notes">
              🎁 {r.label} — {r.text}
            </div>
          ))}
          {boss.notes && <div className="boss-notes">{boss.notes}</div>}
          <TeamWeaknesses boss={boss} />
          <div className="mon-grid">
            {boss.pokemon.map((m, i) => (
              <MonCard
                key={i}
                mon={m}
                battleEffect={boss.battleEffect}
                levelCap={levelCap}
                team={boss.pokemon}
                teamLabel={boss.title + (boss.subtitle ? ` — ${boss.subtitle}` : "")}
                onCalc={onCalc}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TeamWeaknesses({ boss }: { boss: Boss }) {
  const profiles = boss.pokemon.map((m) => defensiveProfile(m.species, m.ability));
  if (profiles.every((p) => Object.keys(p).length === 0)) return null;
  const rows = ALL_TYPES.map((atk) => {
    const weak = profiles.filter((p) => (p[atk] ?? 1) > 1).length;
    const immune = profiles.filter((p) => p[atk] === 0).length;
    const resist = profiles.filter((p) => {
      const m = p[atk] ?? 1;
      return m > 0 && m < 1;
    }).length;
    return { atk, weak, resist, immune };
  })
    .filter((r) => r.weak > 0)
    .sort((a, b) => b.weak - a.weak || a.immune + a.resist - (b.immune + b.resist));
  if (rows.length === 0) return null;
  return (
    <div className="team-weak">
      <span className="team-weak-label">Team is weak to:</span>
      {rows.map((r) => (
        <span key={r.atk} className="team-weak-chip">
          <span className="type-badge" style={{ background: typeColor(r.atk) }}>
            {r.atk}
          </span>
          <span className="team-weak-counts">
            {r.weak}/{boss.pokemon.length} weak
            {r.resist > 0 && ` · ${r.resist} resist`}
            {r.immune > 0 && ` · ${r.immune} immune`}
          </span>
        </span>
      ))}
    </div>
  );
}

