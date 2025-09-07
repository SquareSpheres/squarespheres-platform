"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme, resolvedTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    // Return a placeholder that matches the expected size to prevent layout shift
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg">
        <div className="h-5 w-5" />
        <span className="hidden md:inline font-medium text-sm w-12" />
      </div>
    )
  }

  // Use resolvedTheme which gives us the actual theme being used
  const currentTheme = resolvedTheme || theme

  return (
    <button
      onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
      className="flex items-center gap-2 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      title={`Switch to ${currentTheme === "dark" ? "light" : "dark"} mode`}
    >
      {currentTheme === "dark" ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
      <span className="hidden md:inline font-medium text-sm">
        {currentTheme === "dark" ? "Light" : "Dark"}
      </span>
    </button>
  )
}
