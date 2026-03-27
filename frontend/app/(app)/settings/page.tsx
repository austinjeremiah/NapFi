"use client"

import { ScrambleText } from "@/components/ui/scramble-text"
import { DotPattern } from "@/components/ui/dot-pattern"

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <DotPattern className="pointer-events-none absolute inset-0 h-full w-full opacity-30" />

      <div className="mx-auto max-w-3xl">
        <div className="border-l-2 border-foreground pl-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">NapFi / Settings</p>
          <h1 className="mt-1 font-pixel text-2xl font-bold text-foreground">
            <ScrambleText text="SETTINGS" />
          </h1>
        </div>
        <p className="mt-8 font-mono text-sm text-muted-foreground">Coming soon.</p>
      </div>
    </main>
  )
}
