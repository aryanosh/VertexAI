"use client"

import { useEffect, useState } from "react"

/**
 * Animates a number from 0 to `target` once, on mount.
 * Mirrors the count-up motion seen across the video frames.
 */
export function useCountUp(target: number, duration = 1200, decimals = 0) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    let raf = 0
    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const t = Math.min(elapsed / duration, 1)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(target * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setValue(target)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return decimals > 0 ? value.toFixed(decimals) : Math.round(value)
}
