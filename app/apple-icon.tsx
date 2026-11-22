import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const block = (l: number, t: number, w: number, h: number, r: number, bg = "#f7f4ef") => (
    <div style={{ position: "absolute", left: l, top: t, width: w, height: h, borderRadius: r, background: bg }} />
  );
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, background: "#0f766e", display: "flex", position: "relative" }}>
        {block(73, 22, 34, 34, 17)}
        {block(67, 62, 46, 56, 14)}
        {block(42, 65, 17, 50, 8)}
        {block(121, 65, 17, 50, 8)}
        {block(70, 121, 17, 42, 8)}
        {block(93, 121, 17, 42, 8)}
        {block(108, 54, 34, 34, 17, "#f2555a")}
      </div>
    ),
    size
  );
}
