"use client";

import { useMemo, useState } from "react";

interface PieCategory {
  id: string;
  name: string;
  color: string;
  amount: number;
  operations: Array<{
    id: string;
    label: string;
    date: string;
    amount: number;
  }>;
}

interface PieSegment extends PieCategory {
  path: string;
  percentage: number;
}

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 96;

function formatEuro(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function pointAt(angle: number): { x: number; y: number } {
  const radians = angle * Math.PI / 180;
  return { x: CENTER + RADIUS * Math.cos(radians), y: CENTER + RADIUS * Math.sin(radians) };
}

function piePath(startAngle: number, endAngle: number): string {
  const start = pointAt(startAngle);
  const end = pointAt(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${CENTER} ${CENTER} L ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)} Z`;
}

export function CategorySpendingView({ items, children }: { items: PieCategory[]; children: React.ReactNode }) {
  const [view, setView] = useState<"list" | "pie">("list");
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const segments = useMemo(() => items.map((item, index): PieSegment => {
    const amountBefore = items.slice(0, index).reduce((sum, previous) => sum + previous.amount, 0);
    const percentage = total ? item.amount / total * 100 : 0;
    const startAngle = total ? -90 + amountBefore / total * 360 : -90;
    const endAngle = total ? startAngle + item.amount / total * 360 : startAngle;
    return { ...item, percentage, path: piePath(startAngle, endAngle) };
  }), [items, total]);
  const active = segments.find((item) => item.id === activeId) ?? segments[0];

  if (!items.length) return children;

  return <>
    <div className="category-view-toggle" role="group" aria-label="Présentation des dépenses">
      <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>Liste</button>
      <button type="button" aria-pressed={view === "pie"} onClick={() => setView("pie")}>Camembert</button>
    </div>
    {view === "list" ? children : <div className="category-pie-layout">
      <div className="category-pie-chart">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-labelledby="category-pie-title category-pie-description">
          <title id="category-pie-title">Répartition des dépenses du mois par catégorie</title>
          <desc id="category-pie-description">Chaque part représente le montant dépensé dans une catégorie. Utilisez la légende pour parcourir les valeurs.</desc>
          {segments.length === 1
            ? <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={segments[0].color}/>
            : segments.map((segment) => <path
              key={segment.id}
              d={segment.path}
              fill={segment.color}
              className={segment.id === active?.id ? "active" : ""}
              aria-label={`${segment.name} : ${formatEuro(segment.amount)}, ${segment.percentage.toFixed(1)} %`}
              onMouseEnter={() => setActiveId(segment.id)}
              onClick={() => setActiveId(segment.id)}
            ><title>{`${segment.name} : ${formatEuro(segment.amount)} (${segment.percentage.toFixed(1)} %)`}</title></path>)}
        </svg>
        {active ? <div className="category-pie-active" aria-live="polite"><span style={{ background: active.color }}/><div><strong>{active.name}</strong><small>{active.percentage.toFixed(1)} % du mois</small></div><b>{formatEuro(active.amount)}</b></div> : null}
      </div>
      <div className="category-pie-legend" aria-label="Légende des catégories">
        {segments.map((segment) => <button
          type="button"
          key={segment.id}
          aria-pressed={segment.id === active?.id}
          onMouseEnter={() => setActiveId(segment.id)}
          onFocus={() => setActiveId(segment.id)}
          onClick={() => setActiveId(segment.id)}
        ><span style={{ background: segment.color }}/><span>{segment.name}</span><strong>{formatEuro(segment.amount)}</strong></button>)}
      </div>
      {active ? <div className="category-pie-operations" aria-live="polite">
        <div className="category-pie-operations-heading"><strong>Opérations · {active.name}</strong><span>{active.operations.length} opération{active.operations.length > 1 ? "s" : ""}</span></div>
        <ul>{active.operations.map((operation) => <li key={operation.id}><div><strong>{operation.label}</strong><small>{operation.date}</small></div><b>−{formatEuro(operation.amount)}</b></li>)}</ul>
      </div> : null}
    </div>}
  </>;
}
