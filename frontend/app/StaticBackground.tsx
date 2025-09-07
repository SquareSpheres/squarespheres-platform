"use client";

import type React from "react";
import { useState, useEffect } from "react";

const CHARACTERS = [
  "0",
  "1",
  "{",
  "}",
  "[",
  "]",
  "<",
  ">",
  "/",
  ";",
  ":",
  "*",
  "+",
  "-",
  "=",
  "_",
  "|",
  "\\",
  "/",
  "?",
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "_",
  "+",
  "-",
  "=",
  "|",
  "\\",
  "/",
  "?",
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "(",
  ")",
];
const FONT_SIZES = [6, 8, 10, 12];
const OPACITIES = [0.02, 0.04, 0.06, 0.09];

interface DigitalCharacter {
  id: number;
  char: string;
  style: React.CSSProperties;
}

const generateCharacters = (count: number): DigitalCharacter[] => {
  return Array.from({ length: count }, (_, i) => {
    const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    const fontSize = FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)];
    const opacity = OPACITIES[Math.floor(Math.random() * OPACITIES.length)];
    const color = "hsl(var(--muted-foreground) / 0.6)";
    const top = `${100 + Math.random() * 20}%`;
    const left = `${Math.random() * 100}%`;
    const animationDuration = `${Math.random() * 15 + 20}s`;
    const animationDelay = `-${Math.random() * 35}s`;

    return {
      id: i,
      char,
      style: {
        position: "absolute",
        top,
        left,
        fontSize: `${fontSize}px`,
        opacity,
        fontFamily: "monospace",
        color,
        animation: `upward-drift ${animationDuration} linear infinite`,
        animationDelay,
        userSelect: "none",
        pointerEvents: "none",
        willChange: "transform",
        filter: "blur(1.5px)",
      },
    };
  });
};

export default function StaticBackground() {
  const [characters, setCharacters] = useState<DigitalCharacter[]>([]);

  useEffect(() => {
    setCharacters(generateCharacters(150));
  }, []);

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-accent/[0.04] to-chart-2/[0.06] backdrop-blur-sm" />
      <div className="absolute inset-0 bg-gradient-to-tl from-chart-1/[0.04] via-transparent to-secondary/[0.06] backdrop-blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-muted/[0.03] to-transparent backdrop-blur-[1px]" />
      {characters.map((item) => (
        <span key={item.id} style={item.style}>
          {item.char}
        </span>
      ))}
    </div>
  );
}
