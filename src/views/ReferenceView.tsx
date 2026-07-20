import { useState } from "react";
import encountersJson from "../data/encounters.json";
import itemsJson from "../data/items.json";
import type {
  EncountersData,
  ItemEntry,
  ItemsData,
  RaidLocation,
  TmEntry,
} from "../types";
import { Sprite } from "../components/Sprite";
import { ItemSprite } from "../components/ItemSprite";
import { TypeBadges } from "../components/TypeBadges";

const items = itemsJson as unknown as ItemsData;
const data = encountersJson as unknown as EncountersData;

type RefTab =
  | "statics"
  | "gifts"
  | "trades"
  | "fossils"
  | "eggs"
  | "raids"
  | "tms"
  | "items";

const TABS: { id: RefTab; label: string }[] = [
  { id: "statics", label: "Statics & Legendaries" },
  { id: "gifts", label: "Gifts" },
  { id: "trades", label: "Trades" },
  { id: "fossils", label: "Fossils" },
  { id: "eggs", label: "Egg Vendor" },
  { id: "raids", label: "Raid Dens" },
  { id: "tms", label: "TMs & HMs" },
  { id: "items", label: "Items" },
];

export function ReferenceView() {
  const [tab, setTab] = useState<RefTab>("statics");
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();

  return (
    <div className="reference">
      <div className="toolbar">
        <div className="segmented">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="search"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {tab === "statics" && (
        <table className="ref-table">
          <tbody>
            {data.statics
              .filter((s) => !q || s.species.toLowerCase().includes(q) || s.info.toLowerCase().includes(q))
              .map((s, i) => (
                <tr key={i}>
                  <td className="cell-sprite">
                    <Sprite species={s.species} size={36} />
                  </td>
                  <td className="cell-species">{s.species}</td>
                  <td>
                    <TypeBadges species={s.species} small />
                  </td>
                  <td>{s.info}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {tab === "gifts" && (
        <table className="ref-table">
          <tbody>
            {data.gifts
              .filter(
                (g) =>
                  !q ||
                  g.species.toLowerCase().includes(q) ||
                  g.location.toLowerCase().includes(q),
              )
              .map((g, i) => (
                <tr key={i}>
                  <td className="cell-sprite">
                    <Sprite species={g.species} size={36} />
                  </td>
                  <td className="cell-species">{g.species}</td>
                  <td className="muted">{g.location}</td>
                  <td>
                    {g.requirements} {g.info && <span className="muted">({g.info})</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {tab === "trades" && (
        <table className="ref-table">
          <tbody>
            {data.trades
              .filter(
                (t) =>
                  !q ||
                  t.give.toLowerCase().includes(q) ||
                  t.receive.toLowerCase().includes(q),
              )
              .map((t, i) => (
                <tr key={i}>
                  <td className="cell-sprite">
                    <Sprite species={t.give} size={36} />
                  </td>
                  <td>
                    Give <strong>{t.give}</strong>
                  </td>
                  <td className="cell-sprite">
                    <Sprite species={t.receive} size={36} />
                  </td>
                  <td>
                    Receive <strong>{t.receive}</strong>
                  </td>
                  <td className="muted">{t.location}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {tab === "fossils" && <SpeciesColumns groups={data.fossils} q={q} />}
      {tab === "eggs" && <SpeciesColumns groups={data.eggVendor} q={q} />}
      {tab === "raids" && <Raids raids={data.raids} q={q} />}
      {tab === "tms" && <TmList q={q} />}
      {tab === "items" && <ItemList q={q} />}
    </div>
  );
}

function TmList({ q }: { q: string }) {
  const match = (t: TmEntry) =>
    !q ||
    t.move.toLowerCase().includes(q) ||
    t.location.toLowerCase().includes(q) ||
    t.num.includes(q);
  const groups: { label: string; kind: string; list: TmEntry[] }[] = [
    { label: "TMs", kind: "TM", list: items.tms.filter(match) },
    { label: "HMs", kind: "HM", list: items.hms.filter(match) },
  ];
  return (
    <div className="tm-list">
      {groups.map(({ label, kind, list }) => (
        <section key={kind}>
          <h3>
            {label} <span className="count">({list.length})</span>
          </h3>
          <table className="ref-table">
            <tbody>
              {list.map((t) => (
                <tr key={kind + t.num}>
                  <td className="tm-num">
                    {kind}
                    {t.num}
                  </td>
                  <td className="tm-move">{t.move}</td>
                  <td>
                    {t.location}
                    {t.notes.map((n) => (
                      <div key={n} className="tm-note">
                        {n}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function ItemList({ q }: { q: string }) {
  const match = (i: ItemEntry) =>
    !q || i.name.toLowerCase().includes(q) || i.location.toLowerCase().includes(q);
  const specials: { label: string; list: ItemEntry[] }[] = [
    { label: "Mega Stones", list: items.megaStones.filter(match) },
    { label: "Z-Crystals", list: items.zCrystals.filter(match) },
  ];
  const areas = items.overworld
    .map((a) => ({
      area: a.area,
      items: a.items.filter(
        (i) => match(i) || a.area.toLowerCase().includes(q),
      ),
    }))
    .filter((a) => a.items.length > 0);
  return (
    <div className="item-list">
      {specials.map(
        ({ label, list }) =>
          list.length > 0 && (
            <section key={label}>
              <h3>
                {label} <span className="count">({list.length})</span>
              </h3>
              <table className="ref-table">
                <tbody>
                  {list.map((i, idx) => (
                    <tr key={idx}>
                      <td className="cell-item-sprite">
                        <ItemSprite name={i.name} />
                      </td>
                      <td className="tm-move">{i.name}</td>
                      <td>{i.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ),
      )}
      <section>
        <h3>Overworld Items</h3>
        {areas.map((a) => (
          <div key={a.area} className="item-area">
            <h4>{a.area}</h4>
            <table className="ref-table">
              <tbody>
                {a.items.map((i, idx) => (
                  <tr key={idx}>
                    <td className="cell-item-sprite">
                      <ItemSprite name={i.name} />
                    </td>
                    <td className="tm-move">{i.name}</td>
                    <td>{i.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {areas.length === 0 && <p className="muted">No items match.</p>}
      </section>
    </div>
  );
}

function Raids({ raids, q }: { raids: EncountersData["raids"]; q: string }) {
  const [showInfo, setShowInfo] = useState(false);
  const locations = raids.locations.filter(
    (l) =>
      !q ||
      l.location.toLowerCase().includes(q) ||
      l.dens.some(
        (d) =>
          d.species.toLowerCase().includes(q) ||
          d.drops.some((dr) => dr.item.toLowerCase().includes(q)),
      ),
  );
  return (
    <div className="raids">
      <button className="raid-info-toggle" onClick={() => setShowInfo(!showInfo)}>
        {showInfo ? "▾" : "▸"} How raid difficulty scales with badges
      </button>
      {showInfo && (
        <ul className="raid-info">
          {raids.info.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {locations.map((loc, i) => (
        <RaidLocationCard key={i} loc={loc} q={q} />
      ))}
      {locations.length === 0 && <p className="muted">No raid dens match.</p>}
    </div>
  );
}

function RaidLocationCard({ loc, q }: { loc: RaidLocation; q: string }) {
  const [openDen, setOpenDen] = useState<number | null>(null);
  const den = openDen !== null ? loc.dens[openDen] : null;
  return (
    <div className="raid-card">
      <div className="raid-head">
        <span className="raid-loc">{loc.location}</span>
        <span className="raid-stars">{"★".repeat(loc.stars)}</span>
      </div>
      <div className="raid-dens">
        {loc.dens.map((d, i) => (
          <button
            key={i}
            className={
              "raid-den" +
              (openDen === i ? " active" : "") +
              (q && d.species.toLowerCase().includes(q) ? " hit" : "")
            }
            onClick={() => setOpenDen(openDen === i ? null : i)}
          >
            <Sprite species={d.species} size={32} />
            {d.species}
            <TypeBadges species={d.species} small />
          </button>
        ))}
      </div>
      {den && (
        <table className="raid-drops">
          <tbody>
            {den.drops.map((d, i) => (
              <tr key={i}>
                <td className="cell-item-sprite">
                  <ItemSprite name={d.item} />
                </td>
                <td>{d.item}</td>
                <td className="cell-rarity">{d.rarity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SpeciesColumns({ groups, q }: { groups: Record<string, string[]>; q: string }) {
  return (
    <div className="species-columns">
      {Object.entries(groups).map(([label, species]) => (
        <div key={label} className="species-column">
          <h4>{label}</h4>
          {species
            .filter((s) => !q || s.toLowerCase().includes(q))
            .map((s) => (
              <div key={s} className="species-line">
                <Sprite species={s} size={30} /> {s}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
