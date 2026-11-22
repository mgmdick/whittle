"use client";

import { forwardRef, useId } from "react";
import { BODY_VIEWBOX } from "@/lib/regions";
import { BODY_PARTS, EARS, contourPaths } from "@/lib/silhouette";
import { intensityColor, type PainMarker, type View } from "@/lib/types";

type Props = {
  view: View;
  markers: PainMarker[];
  selectedId?: string | null;
  interactive?: boolean;
  showLabels?: boolean;
  compact?: boolean;
  className?: string;
  onSvgClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
};

const BodyFigure = forwardRef<SVGSVGElement, Props>(function BodyFigure(
  { view, markers, selectedId, interactive, showLabels, compact, className, onSvgClick },
  ref
) {
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `${n}-${uid}`;
  const inView = markers.filter((m) => m.view === view);
  const { paths, dots } = contourPaths(view);

  return (
    <svg
      ref={ref}
      viewBox={BODY_VIEWBOX}
      className={className}
      onClick={onSvgClick}
      role={interactive ? "application" : "img"}
      aria-label={`Body, ${view} view${inView.length ? `, ${inView.length} sore spots` : ""}`}
    >
      <defs>
        <linearGradient id={id("skin")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--skin-edge)" }} />
          <stop offset="0.28" style={{ stopColor: "var(--skin-mid)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--skin-hi)" }} />
          <stop offset="0.74" style={{ stopColor: "var(--skin-mid)" }} />
          <stop offset="1" style={{ stopColor: "var(--skin-edge)" }} />
        </linearGradient>
        <radialGradient id={id("top")} cx="0.5" cy="0" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("floor")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: "var(--floor-shadow)", stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: "var(--floor-shadow)", stopOpacity: 0 }} />
        </radialGradient>
        <clipPath id={id("clip")}>
          {BODY_PARTS.map((p) => (
            <path key={p.id} d={p.d} />
          ))}
          {EARS.map((e, i) => (
            <ellipse key={i} {...e} />
          ))}
        </clipPath>
        {inView.map((m) => (
          <radialGradient key={m.id} id={id(`heat-${m.id}`)}>
            <stop offset="0" stopColor={intensityColor(m.intensity)} stopOpacity="0.95" />
            <stop offset="0.45" stopColor={intensityColor(m.intensity)} stopOpacity="0.45" />
            <stop offset="1" stopColor={intensityColor(m.intensity)} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>

      <ellipse cx="100" cy="413" rx="40" ry="5" fill={`url(#${id("floor")})`} />

      {/* Union outline: every part stroked first, then filled on top. */}
      <g className="body-outline" data-body="1">
        {BODY_PARTS.map((p) => (
          <path key={p.id} d={p.d} />
        ))}
        {EARS.map((e, i) => (
          <ellipse key={i} {...e} />
        ))}
      </g>
      <g data-body="1" className={interactive ? "body-fill interactive" : "body-fill"}>
        {EARS.map((e, i) => (
          <ellipse key={i} {...e} fill={`url(#${id("skin")})`} />
        ))}
        {BODY_PARTS.map((p) => (
          <path key={p.id} d={p.d} fill={`url(#${id("skin")})`} />
        ))}
      </g>

      <g pointerEvents="none" clipPath={`url(#${id("clip")})`}>
        <rect x="0" y="0" width="200" height="140" fill={`url(#${id("top")})`} />
        {!compact && (
          <g className="contours">
            {paths.map((d, i) => (
              <path key={i} d={d} />
            ))}
            {dots.map(([cx, cy, r], i) => (
              <circle key={i} cx={cx} cy={cy} r={r} />
            ))}
          </g>
        )}
        {inView.map((m) => (
          <circle
            key={m.id}
            cx={m.x}
            cy={m.y}
            r={9 + m.intensity * 1.7}
            fill={`url(#${id(`heat-${m.id}`)})`}
            className="heat"
          />
        ))}
      </g>

      {!compact && (
        <>
          <text x="10" y="16" className="side-label" pointerEvents="none">
            {view === "front" ? "R" : "L"}
          </text>
          <text x="190" y="16" textAnchor="end" className="side-label" pointerEvents="none">
            {view === "front" ? "L" : "R"}
          </text>
        </>
      )}

      {inView.map((m) => (
        <g key={m.id} transform={`translate(${m.x} ${m.y})`} data-marker={m.id} className="marker">
          <g className="marker-pop">
            {m.intensity >= 7 && !compact && (
              <circle r="8" className="marker-pulse" style={{ fill: intensityColor(m.intensity) }} />
            )}
            {interactive && <circle r="12" fill="transparent" />}
            <circle
              r={compact ? 4.5 : m.id === selectedId ? 7.5 : 6.2}
              style={{ fill: intensityColor(m.intensity) }}
              className="marker-dot"
            />
            {showLabels && (
              <text y="2.4" textAnchor="middle" className="marker-num">
                {m.intensity}
              </text>
            )}
          </g>
        </g>
      ))}
    </svg>
  );
});

export default BodyFigure;
