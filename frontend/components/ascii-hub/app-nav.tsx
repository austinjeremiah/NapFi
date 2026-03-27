"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useWeb3Auth } from "@web3auth/modal/react"

const NAV_LINKS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Receipts", href: "/receipts" },
  { label: "Settings", href: "/settings" },
]

export function AppNav() {
  const pathname = usePathname()
  const { web3Auth, isConnected } = useWeb3Auth()

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-xl text-foreground transition-all hover:opacity-70"
        >
          <span className="text-muted-foreground">{">"}</span>
          <span className="font-pixel tracking-wider">NapFi</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 font-mono text-xs transition-all duration-200 ${
                pathname === link.href
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-foreground hover:text-background"
              }`}
            >
              {link.label.toUpperCase()}
            </Link>
          ))}
        </div>

        {/* Disconnect */}
        {isConnected && (
          <button
            onClick={() => web3Auth?.logout()}
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Disconnect
          </button>
        )}
      </nav>
    </header>
  )
}
