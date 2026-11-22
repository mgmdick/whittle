"use client";

import { forwardRef } from "react";
import { BODY_VIEWBOX, REGIONS, type Shape } from "@/lib/regions";
import { intensityColor, type PainMarker, type View } from "@/lib/types";

function ShapeEl({ s, ...rest }: { s: Shape } & React.SVGProps<SVGElement>) {
  if (s.kind === "ellipse")
    return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...(rest as React.SVGProps<SVGEllipseElement>)} />;
  return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} {...(rest as React.SVGProps<SVGRectElement>)} />;
}

type Props = {
  view: View;
  markers: PainMarker[];
  selectedId?: string | null;
  interactive?: boolean;
  showLabels?: boolean;
  className?: string;
  onSvgClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
};

const BodyFigure = forwardRef<SVGSVGElement, Props>(function BodyFigure(
  { view, markers, selectedId, interactive, showLabels, className, onSvgClick },
  ref
) {
  const regions = REGIONS[view];
  const inView = markers.filter((m) => m.view === view);
  const worst: Record<string, number> = {};
  for (const m of inView) worst[m.regionId] = Math.max(worst[m.regionId] ?? 0, m.intensity);

  return (
    <svg
      ref={ref}
      viewBox={BODY_VIEWBOX}
      className={className}
      onClick={onSvgClick}
      role={interactive ? "application" : "img"}
      aria-label={`Body, ${view} view`}
    >
      {regions.map((r) => {
        const w = worst[r.id];
        return (
          <ShapeEl
            key={r.id}
            s={r.shape}
            data-region={r.id}
            data-name={r.name}
            className={interactive ? "region interactive" : "region"}
            style={w ? { fill: intensityColor(w), fillOpacity: 0.35 } : undefined}
          >
            <title>{r.name}</title>
          </ShapeEl>
        );
      })}
      {view === "back" && (
        <line x1="100" y1="58" x2="100" y2="200" className="spine" pointerEvents="none" />
      )}
      {view === "front" && (
        <g pointerEvents="none" className="face">
          <circle cx="93" cy="30" r="1.6" />
          <circle cx="107" cy="30" r="1.6" />
          <path d="M94 44 Q100 47 106 44" fill="none" />
        </g>
      )}
      <text x="8" y="14" className="side-label" pointerEvents="none">
        {view === "front" ? "R" : "L"}
      </text>
      <text x="192" y="14" textAnchor="end" className="side-label" pointerEvents="none">
        {view === "front" ? "L" : "R"}
      </text>
      {inView.map((m) => (
        <g key={m.id} transform={`translate(${m.x} ${m.y})`} data-marker={m.id} className="marker">
          {m.intensity >= 7 && <circle r="9" className="marker-pulse" style={{ fill: intensityColor(m.intensity) }} />}
          <circle r="11" fill="transparent" />
          <circle
            r={m.id === selectedId ? 7 : 5.5}
            style={{ fill: intensityColor(m.intensity) }}
            className="marker-dot"
          />
          {showLabels && (
            <text y="2.3" textAnchor="middle" className="marker-num">
              {m.intensity}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
});

export default BodyFigure;
