import React from "react";
import { icons } from "lucide";

// Lucide's icon data (ISC licence), rendered by hand so every stroke can draw itself on.
type Node = [string, Record<string, string | number>];

const pascal = (name: string) =>
  name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");

const ALIASES: Record<string, string> = {
  ai: "Sparkles",
  robot: "Bot",
  money: "Coins",
  cash: "Banknote",
  price: "Tag",
  chat: "MessageCircle",
  message: "MessageCircle",
  email: "Mail",
  warning: "TriangleAlert",
  alert: "TriangleAlert",
  check: "Check",
  ok: "Check",
  no: "X",
  phone: "Smartphone",
  computer: "Laptop",
  idea: "Lightbulb",
  time: "Clock",
  speed: "Zap",
  fast: "Zap",
  secure: "ShieldCheck",
  security: "ShieldCheck",
  privacy: "Lock",
  search: "Search",
  data: "Database",
  file: "FileText",
  document: "FileText",
  photo: "Image",
  picture: "Image",
  video: "Clapperboard",
  music: "Music",
  person: "User",
  people: "Users",
  limit: "Gauge",
  token: "Hexagon",
  tokens: "Hexagon",
  word: "Type",
  text: "Type",
  brain: "Brain",
  question: "CircleHelp",
};

export function iconNodes(name: string): Node[] {
  const lib = icons as unknown as Record<string, Node[]>;
  if (!name) return lib.Sparkles;
  const key = pascal(name);
  return lib[key] ?? lib[ALIASES[name.toLowerCase().trim()] ?? ""] ?? lib[key.replace(/s$/, "")] ?? lib.Sparkles;
}

/**
 * A Lucide icon whose strokes draw on as `draw` goes 0→1.
 */
export function Icon({
  name,
  size,
  color,
  draw = 1,
  strokeWidth = 1.6,
  fill = "none",
  style,
}: {
  name: string;
  size: number;
  color: string;
  draw?: number;
  strokeWidth?: number;
  fill?: string;
  style?: React.CSSProperties;
}) {
  const nodes = iconNodes(name);
  const d = Math.max(0, Math.min(1, draw));
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible", ...style }}>
      {nodes.map(([tag, attrs], i) =>
        React.createElement(tag, {
          key: i,
          ...attrs,
          fill,
          pathLength: 1,
          strokeDasharray: 1,
          strokeDashoffset: 1 - d,
        }),
      )}
    </svg>
  );
}
