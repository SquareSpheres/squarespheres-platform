"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import { ReactNode } from "react";

interface ClerkThemeProviderProps {
  children: ReactNode;
}

export function ClerkThemeProvider({ children }: ClerkThemeProviderProps) {
  const { resolvedTheme } = useTheme();

  return (
    <ClerkProvider
      dynamic
      appearance={{
        baseTheme: resolvedTheme === "dark" ? dark : undefined,
        variables: {
          colorPrimary: resolvedTheme === "dark" ? "#8FB58F" : "#7F9F7F",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
