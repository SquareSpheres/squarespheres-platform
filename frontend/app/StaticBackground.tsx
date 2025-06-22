'use client'

import React, { useState, useEffect } from 'react'

const CHARACTERS = ['0', '1', '{', '}', '[', ']', '<', '>', '/', ';', ':']
const FONT_SIZES = [8, 10, 12, 14]
const OPACITIES = [0.1, 0.2, 0.3, 0.4]

interface DigitalCharacter {
  id: number
  char: string
  style: React.CSSProperties
}

const generateCharacters = (count: number): DigitalCharacter[] => {
  return Array.from({ length: count }, (_, i) => {
    const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]
    const fontSize = FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)]
    const opacity = OPACITIES[Math.floor(Math.random() * OPACITIES.length)]
    const top = `${Math.random() * 100}%`
    const left = `${Math.random() * 100}%`
    const animationDuration = `${Math.random() * 20 + 30}s`
    const animationDelay = `-${Math.random() * 20}s`

    return {
      id: i,
      char,
      style: {
        position: 'absolute',
        top,
        left,
        fontSize: `${fontSize}px`,
        opacity,
        fontFamily: 'monospace',
        color: '#4A5568', // A muted gray-blue
        animation: `drift ${animationDuration} linear infinite`,
        animationDelay,
        userSelect: 'none',
        pointerEvents: 'none',
      },
    }
  })
}

export default function StaticBackground() {
  const [characters, setCharacters] = useState<DigitalCharacter[]>([])

  useEffect(() => {
    setCharacters(generateCharacters(750))
  }, [])

  return (
    <>
      {characters.map((item) => (
        <span key={item.id} style={item.style}>
          {item.char}
        </span>
      ))}
    </>
  )
} 