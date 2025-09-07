"use client";

import type React from "react";
import { useState, useEffect, useMemo } from "react";

const CHARACTERS = ["0", "1", "{", "}", "[", "]", "<", ">", "/", ";", ":", "*", "+", "-", "=", "_", "|", "\\", "?", "!", "@", "#", "$", "%", "^", "&", "(", ")"];
const FONT_SIZES = [8, 10, 12];
const OPACITIES = [0.03, 0.05, 0.08];

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
    const animationDuration = `${Math.random() * 10 + 25}s`;
    const animationDelay = `-${Math.random() * 30}s`;

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
        filter: "blur(1px)"
      },
    };
  });
};

export default function StaticBackground() {
  const [characters, setCharacters] = useState<DigitalCharacter[]>([]);

  const characterCount = useMemo(() => {
    if (typeof window === 'undefined') return 10;
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    const baseCount = Math.floor((width * height) / 80000);
    const minCount = 8;
    const maxCount = 25;
    
    return Math.max(minCount, Math.min(maxCount, baseCount));
  }, []);

  useEffect(() => {
    const updateCharacters = () => {
      setCharacters(generateCharacters(characterCount));
    };

    updateCharacters();

    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateCharacters, 250);
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [characterCount]);

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-accent/[0.02] to-chart-2/[0.04]" />
      {characters.map((item) => (
        <span key={item.id} style={item.style}>
          {item.char}
        </span>
      ))}
    </div>
  );
}
