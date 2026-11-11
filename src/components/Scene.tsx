import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../hooks'
import { startScene, type SceneControls, type TimeOfDay, type Weather } from '../scene/scene'

/** The pixel-art world behind the whole site. A still picture when motion is reduced. */
export function Scene({ time, weather }: { time: TimeOfDay; weather: Weather }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const controls = useRef<SceneControls | null>(null)

  useEffect(() => {
    if (!canvas.current) return
    try {
      controls.current = startScene(canvas.current, { time, weather, still: prefersReducedMotion() })
    } catch {
      // No canvas: the plain dark background shows instead.
    }
    return () => controls.current?.stop()
    // The scene starts once; later changes go through set() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    controls.current?.set({ time, weather })
  }, [time, weather])

  return <canvas className="scene" ref={canvas} aria-hidden="true" />
}
