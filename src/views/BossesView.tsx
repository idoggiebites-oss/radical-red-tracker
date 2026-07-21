import { useEffect, useMemo, useRef, useState } from "react";
import type { Boss, BossMode, GameMode, Run } from "../types";
import { orderChainInfo, type BossTarget } from "../lib/bossTarget";
import { Sprite } from "../components/Sprite";
import { MonCard } from "../components/MonCard";
import { type CaughtMon } from "../components/CalcPanel";
import { abilitiesRandomized } from "../lib/saveFile";
import { bossMatchesStarter, rivalStarterFor } from "../lib/starters";
import { nextLevelCap } from "../lib/levelCap";
import { ALL_TYPES, defensiveProfile, typeColor } from "../lib/effectiveness";

export function BossesView({
  modeData,
  mode,
  run,
  updateRun,
  focus,
}: {
  modeData: BossMode;
  mode: GameMode;
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
  /** cap-pill navigation: jump to this boss team and open it */
  focus?: (BossTarget & { nonce: number }) | null;
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

  const caught = useMemo<CaughtMon[]>(
    () =>
      Object.values(run?.encounters ?? {})
        .filter((e) => e.species && e.status === "caught")
        .map((e) => ({ species: e.species, nickname: e.nickname, build: e.build })),
    [run],
  );

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
          caught={caught}
          rivalStarter={rivalStarter}
          hardcore={mode === "hardcore"}
          anyAbility={abilitiesRandomized(run)}
          focus={focus}
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
  const nextIdx = useMemo(() => {
    if (!run) return -1;
    for (let i = 0; i < order.length; i++) {
      if (!run.defeated[i] && !order[i].optional) return i;
    }
    return -1;
  }, [run, order]);
  const chains = useMemo(() => orderChainInfo(modeData), [modeData]);

  return (
    <div className="trainer-order">
      {order.map((t, i) => {
        const done = !!run?.defeated[i];
        return (
          <div
            key={i}
            className={
              "order-row" +
              (done ? " done" : "") +
              (i === nextIdx ? " next" : "") +
              (t.optional ? " optional" : "")
            }
          >
            {run && (
              <input
                type="checkbox"
                checked={done}
                onChange={(e) =>
                  updateRun((r) => ({
                    ...r,
                    defeated: { ...r.defeated, [i]: e.target.checked },
                  }))
                }
              />
            )}
            <span className="order-name">
              {t.name}
              {t.optional && <span className="badge optional">optional</span>}
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
            <span className="order-cap">{t.levelCap && `cap ${t.levelCap}`}</span>
          </div>
        );
      })}
    </div>
  );
}

function BossTeams({
  modeData,
  category,
  filter,
  levelCap,
  caught,
  rivalStarter,
  hardcore,
  anyAbility,
  focus,
}: {
  modeData: BossMode;
  category: string;
  filter: string;
  levelCap?: number;
  caught?: CaughtMon[];
  rivalStarter?: string | null;
  hardcore?: boolean;
  anyAbility?: boolean;
  focus?: (BossTarget & { nonce: number }) | null;
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
          caught={caught}
          hardcore={hardcore}
          anyAbility={anyAbility}
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
  caught,
  hardcore,
  anyAbility,
  focusNonce = 0,
}: {
  boss: Boss;
  levelCap?: number;
  caught?: CaughtMon[];
  hardcore?: boolean;
  anyAbility?: boolean;
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
                caught={caught}
                hardcore={hardcore}
                anyAbility={anyAbility}
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

