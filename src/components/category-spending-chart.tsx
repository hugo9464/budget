"use client";

import { useMemo, useState } from "react";
import type { CategorySpendingSeries } from "@/lib/types";

const WIDTH = 760;
const HEIGHT = 260;
const PADDING = { top: 22, right: 22, bottom: 38, left: 62 };

function monthLabel(month: string): string {
  const labels = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
  return labels[Number(month.slice(5, 7)) - 1] ?? month;
}

function formatEuro(value: number): string {
  const [whole, decimal] = value.toFixed(2).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f")},${decimal} €`;
}

export function CategorySpendingChart({ months, series }: { months: string[]; series: CategorySpendingSeries[] }) {
  const defaultSeries = series.find((item) => item.category.slug === "logement") ?? series[0];
  const [selectedId, setSelectedId] = useState(defaultSeries?.category.id ?? "");
  const selected = series.find((item) => item.category.id === selectedId) ?? defaultSeries;
  const geometry = useMemo(() => {
    if (!selected || !months.length) return null;
    const max = Math.max(...selected.values, 1);
    const plotWidth = WIDTH - PADDING.left - PADDING.right;
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const points = selected.values.map((value, index) => ({
      value,
      x: PADDING.left + (months.length === 1 ? plotWidth / 2 : index * plotWidth / (months.length - 1)),
      y: PADDING.top + plotHeight - value / max * plotHeight,
    }));
    const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    const area = `${line} L${points.at(-1)!.x.toFixed(2)},${(PADDING.top + plotHeight).toFixed(2)} L${points[0].x.toFixed(2)},${(PADDING.top + plotHeight).toFixed(2)} Z`;
    return { max, points, line, area, plotHeight };
  }, [months, selected]);

  if (!selected || !geometry) return <div className="empty-state"><p>Aucune dépense à afficher.</p></div>;
  return <>
    <div className="trend-controls">
      <div><span style={{ background: selected.category.color }}/><strong>{selected.category.name}</strong><small>{formatEuro(selected.total)} sur la période</small></div>
      <label><span className="sr-only">Catégorie affichée</span><select value={selected.category.id} onChange={(event) => setSelectedId(event.target.value)}>{series.map((item) => <option key={item.category.id} value={item.category.id}>{item.category.name}</option>)}</select></label>
    </div>
    <div className="trend-chart-scroll">
      <svg className="trend-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Évolution mensuelle des dépenses ${selected.category.name}`}>
        <defs><linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={selected.category.color} stopOpacity=".22"/><stop offset="100%" stopColor={selected.category.color} stopOpacity="0"/></linearGradient></defs>
        {[0, .5, 1].map((ratio) => {
          const y = PADDING.top + geometry.plotHeight * ratio;
          const value = geometry.max * (1 - ratio);
          return <g key={ratio}><line x1={PADDING.left} y1={y} x2={WIDTH - PADDING.right} y2={y} className="trend-grid-line"/><text x={PADDING.left - 12} y={y + 4} textAnchor="end" className="trend-axis-label">{formatEuro(value)}</text></g>;
        })}
        <path d={geometry.area} fill="url(#trend-area)"/>
        <path d={geometry.line} fill="none" stroke={selected.category.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
        {geometry.points.map((point, index) => <g key={months[index]}><circle cx={point.x} cy={point.y} r="5" fill="white" stroke={selected.category.color} strokeWidth="3" vectorEffect="non-scaling-stroke"><title>{`${monthLabel(months[index])} : ${formatEuro(point.value)}`}</title></circle><text x={point.x} y={HEIGHT - 12} textAnchor="middle" className="trend-axis-label month">{monthLabel(months[index])}</text></g>)}
      </svg>
    </div>
  </>;
}
