"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Scales a fixed-size design down (or up) so the whole dashboard fits
 * inside the viewport as a single, non-scrolling page — matching the
 * framed-panel look in the reference screenshots.
 */
export function FitToScreen({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function update() {
      if (!el) return
      const pad = 32
      const w = el.offsetWidth
      const h = el.offsetHeight
      const s = Math.min(
        (window.innerWidth - pad) / w,
        (window.innerHeight - pad) / h,
      )
      setScale(s)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [])

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-[#d5d6d8]">
      <div
        ref={ref}
        style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
      >
        {children}
      </div>
    </div>
  )
}
