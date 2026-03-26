"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { navLinks } from "@/lib/sections-data"
import { Menu, X, Volume2, VolumeX } from "lucide-react"

export function Navigation() {
  const [activeSection, setActiveSection] = useState("")
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio("/Shane-McMahon-Here-Comes-The-Money.mp3")
    audio.loop = true
    audio.volume = 0.5
    audioRef.current = audio

    const play = () => {
      audio.play().then(() => setPlaying(true)).catch(() => {})
    }

    // Try autoplay; browsers may block until interaction
    play()
    document.addEventListener("click", play, { once: true })
    document.addEventListener("keydown", play, { once: true })

    return () => {
      audio.pause()
      document.removeEventListener("click", play)
      document.removeEventListener("keydown", play)
    }
  }, [])

  const toggleMusic = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => {})
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)

      const sections = navLinks.map((link) => document.getElementById(link.id))
      const scrollPos = window.scrollY + 120

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i]
        if (section && section.offsetTop <= scrollPos) {
          setActiveSection(navLinks[i].id)
          return
        }
      }
      setActiveSection("")
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollToSection = (id: string) => {
    setIsMobileMenuOpen(false)
    setTimeout(() => {
      const el = document.getElementById(id)
      if (el) {
        const offset = 80
        const top = el.getBoundingClientRect().top + window.scrollY - offset
        window.scrollTo({ top, behavior: "smooth" })
      }
    }, 300)
  }

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-md border-b border-border"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-65xl items-center justify-between px-4 py-4 lg:px-8">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex items-center gap-2 font-mono text-xl text-foreground transition-all duration-200 hover:opacity-70 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
          aria-label="Scroll to top"
        >
          <span className="text-muted-foreground">{">"}</span>
          <span className="font-pixel tracking-wider">NapFi</span>
        </button>

        {/* Desktop Nav */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className={`px-3 py-1.5 font-mono text-xs transition-all duration-200 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none ${
                activeSection === link.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-foreground hover:text-background"
              }`}
            >
              <span className="opacity-50">{link.number}</span>{" "}
              {link.title.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Music Toggle */}
        <button
          onClick={toggleMusic}
          className="flex items-center p-2 text-muted-foreground transition-all duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
          aria-label={playing ? "Pause music" : "Play music"}
        >
          {playing ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        {/* Mobile Menu Toggle */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 font-mono text-foreground transition-all duration-200 hover:bg-foreground hover:text-background focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none lg:hidden"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-border bg-background/95 backdrop-blur-md lg:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {navLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => scrollToSection(link.id)}
                  className={`px-3 py-2 text-left font-mono text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none ${
                    activeSection === link.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-foreground hover:text-background"
                  }`}
                >
                  <span className="opacity-50">{link.number}</span>{" "}
                  {link.title.toUpperCase()}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
