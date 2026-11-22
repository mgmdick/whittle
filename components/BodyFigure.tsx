"use client";

import { forwardRef, useId } from "react";
import { BODY_PARTS, EARS, contourPaths, smoothClosed } from "@/lib/silhouette";
import { centroid, drawnMuscles, muscleLabel } from "@/lib/muscles";
import { intensityColor, type PainMarker, type View } from "@/lib/types";

export type ViewBox = { x: number; y: number; w: number; h: number };
export const FULL_VIEWBOX: ViewBox = { x: 0, y: 0, w: 200, h: 420 };

type Props = {
  view: View;
  markers: PainMarker[];
  selectedId?: string | null;
  interactive?: boolean;
  showLabels?: boolean;
  compact?: boolean;
  anatomy?: boolean;
  highlight?: { id: string; side: "A" | "B" } | null;
  viewBox?: ViewBox;
  /** Screen pixels per SVG unit, used to keep labels a readable size. */
  pxPerUnit?: number;
  className?: string;
  onSvgClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
  svgProps?: React.SVGProps<SVGSVGElement>;
};

const SHORT: Record<string, string> = {
  hamstringMedial: "Inner hamstrings",
  hamstringLateral: "Biceps femoris",
  erectorSpinae: "Erector spinae",
  gluteMed: "Gluteus medius",
  infraspinatus: "Infraspinatus",
  forearmFlexors: "Wrist flexors",
  forearmExtensors: "Wrist extensors",
  itBand: "IT band",
  iliopsoas: "Iliopsoas",
  rectusFemoris: "Rectus femoris",
  vastusLateralis: "Vastus lateralis",
  vastusMedialis: "Vastus medialis",
  gastrocnemius: "Gastrocnemius",
  scm: "SCM",
  tfl: "TFL",
  achillesTendon: "Achilles",
  footExtensors: "Extensors",
  peroneals: "Peroneals",
  serratusAnterior: "Serratus",
};
const shortName = (id: string, full: string) => SHORT[id] ?? full.replace(/ \(.*\)$/, "").split(" & ")[0];

const FIBER_BUCKETS = Array.from({ length: 18 }, (_, i) => i * 10);
const bucket = (a: number) => (((Math.round(a / 10) * 10) % 180) + 180) % 180;

const BodyFigure = forwardRef<SVGSVGElement, Props>(function BodyFigure(
  {
    view,
    markers,
    selectedId,
    interactive,
    showLabels,
    compact,
    anatomy,
    highlight,
    viewBox = FULL_VIEWBOX,
    pxPerUnit = 1.6,
    className,
    onSvgClick,
    svgProps,
  },
  ref
) {
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `${n}-${uid}`;
  const inView = markers.filter((m) => m.view === view);
  const { paths, dots } = contourPaths(view);
  const k = viewBox.w / 200; // marker scale so pins stay the same size on screen
  const muscles = anatomy ? drawnMuscles(view) : [];
  const labelSize = 10.5 / pxPerUnit;
  const zoomed = viewBox.w < 150;

  return (
    <svg
      ref={ref}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      className={className}
      onClick={onSvgClick}
      role={interactive ? "application" : "img"}
      aria-label={`Body, ${view} view${inView.length ? `, ${inView.length} sore spots` : ""}`}
      {...svgProps}
    >
      <defs>
        <linearGradient id={id("wood")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--skin-edge)" }} />
          <stop offset="0.3" style={{ stopColor: "var(--skin-mid)" }} />
          <stop offset="0.52" style={{ stopColor: "var(--skin-hi)" }} />
          <stop offset="0.76" style={{ stopColor: "var(--skin-mid)" }} />
          <stop offset="1" style={{ stopColor: "var(--skin-edge)" }} />
        </linearGradient>
        <radialGradient id={id("top")} cx="0.5" cy="0" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("floor")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" style={{ stopColor: "var(--floor-shadow)", stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: "var(--floor-shadow)", stopOpacity: 0 }} />
        </radialGradient>
        {!compact && (
          <filter id={id("grain")} filterUnits="userSpaceOnUse" x="0" y="0" width="200" height="420">
            <feTurbulence type="fractalNoise" baseFrequency="0.32 0.014" numOctaves="3" seed="11" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.18  0 0 0 0 0.07  0 0 0 1.5 -0.55" />
          </filter>
        )}
        <clipPath id={id("clip")}>
          {BODY_PARTS.map((p) => (
            <path key={p.id} d={p.d} />
          ))}
          {EARS.map((e, i) => (
            <ellipse key={i} {...e} />
          ))}
        </clipPath>
        {anatomy && (
          <>
            <radialGradient id={id("muscle")} cx="0.45" cy="0.4" r="0.7">
              <stop offset="0" style={{ stopColor: "var(--muscle-hi)" }} />
              <stop offset="0.6" style={{ stopColor: "var(--muscle-mid)" }} />
              <stop offset="1" style={{ stopColor: "var(--muscle-lo)" }} />
            </radialGradient>
            <linearGradient id={id("tendon")} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#d9c9ae" />
              <stop offset="0.5" stopColor="#f6eee0" />
              <stop offset="1" stopColor="#d2c09f" />
            </linearGradient>
            {FIBER_BUCKETS.map((a) => (
              <pattern
                key={a}
                id={id(`fib-${a}`)}
                patternUnits="userSpaceOnUse"
                width="1.6"
                height="1.6"
                patternTransform={`rotate(${a})`}
              >
                <line x1="0" y1="0.4" x2="1.6" y2="0.4" stroke="rgba(60,10,6,0.35)" strokeWidth="0.35" />
                <line x1="0" y1="1.2" x2="1.6" y2="1.2" stroke="rgba(255,220,210,0.18)" strokeWidth="0.25" />
              </pattern>
            ))}
          </>
        )}
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
          <ellipse key={i} {...e} fill={`url(#${id("wood")})`} />
        ))}
        {BODY_PARTS.map((p) => (
          <path key={p.id} d={p.d} fill={`url(#${id("wood")})`} />
        ))}
      </g>

      <g pointerEvents="none" clipPath={`url(#${id("clip")})`}>
        {!compact && <rect x="0" y="0" width="200" height="420" filter={`url(#${id("grain")})`} className="grain" />}
        <rect x="0" y="0" width="200" height="140" fill={`url(#${id("top")})`} />
        {!compact && !anatomy && (
          <g className="contours">
            <g className="carve-light" transform="translate(0.45 0.55)">
              {paths.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
            <g className="carve-dark">
              {paths.map((d, i) => (
                <path key={i} d={d} />
              ))}
              {dots.map(([cx, cy, r], i) => (
                <circle key={i} cx={cx} cy={cy} r={r} />
              ))}
            </g>
          </g>
        )}

        {anatomy && (
          <g className="anatomy">
            {BODY_PARTS.filter((p) => !p.id.startsWith("hand") && p.id !== "head").map((p) => (
              <path key={p.id} d={p.d} className="fascia" />
            ))}
            {muscles.map(({ muscle, side, pts, fiber }, i) => {
              const d = smoothClosed(pts);
              const lit = highlight && highlight.id === muscle.id && highlight.side === side;
              return (
                <g key={`${muscle.id}-${side}-${i}`} className={"muscle" + (lit ? " lit" : "")}>
                  <path d={d} fill={muscle.tendon ? `url(#${id("tendon")})` : `url(#${id("muscle")})`} />
                  <path d={d} fill={`url(#${id(`fib-${bucket(fiber)}`)})`} className="fibres" />
                  <path d={d} className="muscle-edge" />
                </g>
              );
            })}
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

      {anatomy && showLabels && zoomed && (
        <g className="muscle-labels" pointerEvents="none">
          {(() => {
            const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
            const seen = new Set<string>();
            return muscles.map(({ muscle, side, pts }) => {
              const key = `${muscle.id}-${side}`;
              if (seen.has(key)) return null;
              seen.add(key);
              const [cx, cy] = centroid(pts);
              // Muscles hugging the midline get one label, not two.
              if (side === "B" && Math.abs(cx - 100) < 14) return null;
              if (cx < viewBox.x || cx > viewBox.x + viewBox.w || cy < viewBox.y || cy > viewBox.y + viewBox.h) return null;
              const label = shortName(muscle.id, muscleLabel(muscle, cy, view));
              const w = label.length * labelSize * 0.56;
              const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - labelSize * 0.7, y1: cy + labelSize * 0.7 };
              if (placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) return null;
              placed.push(box);
              return (
                <text
                  key={key}
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontSize: labelSize }}
                  className="muscle-label"
                >
                  {label}
                </text>
              );
            });
          })()}
        </g>
      )}

      {!compact && !(anatomy && showLabels && zoomed) && (
        <g pointerEvents="none" className="side-labels">
          <text x={viewBox.x + 10 * k} y={viewBox.y + 16 * k} style={{ fontSize: 10 * k }} className="side-label">
            {view === "front" ? "R" : "L"}
          </text>
          <text
            x={viewBox.x + viewBox.w - 10 * k}
            y={viewBox.y + 16 * k}
            textAnchor="end"
            style={{ fontSize: 10 * k }}
            className="side-label"
          >
            {view === "front" ? "L" : "R"}
          </text>
        </g>
      )}

      {inView.map((m) => (
        <g key={m.id} transform={`translate(${m.x} ${m.y}) scale(${compact ? 1 : k})`} data-marker={m.id} className="marker">
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
