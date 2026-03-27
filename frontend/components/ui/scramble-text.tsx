"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&"

interface ScrambleTextProps {
  text: string
  className?: string
  duration?: number
  delay?: number
}

export function ScrambleText({ text, className, duration = 1.2, delay = 0 }: ScrambleTextProps) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const chars = text.split("")
    let iteration = 0
    const totalFrames = Math.floor(duration * 30)

    gsap.delayedCall(delay, () => {
      const interval = setInterval(() => {
        el.textContent = chars
          .map((char, i) => {
            if (char === " ") return " "
            if (i < Math.floor((iteration / totalFrames) * chars.length)) {
              return char
            }
            return CHARS[Math.floor(Math.random() * CHARS.length)]
          })
          .join("")

        iteration++
        if (iteration > totalFrames) {
          clearInterval(interval)
          el.textContent = text
        }
      }, 33)
    })
  }, [text, duration, delay])

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  )
}
