import { useEffect, useState } from 'react'
import { loadJson, saveJson } from '../storage'
import { timeFromClock, type TimeOfDay, type Weather } from './scene'

/** What the viewer chose for the sky. Kept on this device only. */
export interface Sky {
  /** Follow the viewer's clock (the default), or stay on `time`. */
  followClock: boolean
  time: TimeOfDay
  /** Let the weather drift on its own every few minutes, or stay on `weather`. */
  drift: boolean
  weather: Weather
}

export const TIMES: TimeOfDay[] = ['morning', 'day', 'evening', 'night']
export const WEATHERS: Weather[] = ['clear', 'mist', 'meteors']

const KEY = 'zats.sky'
const DRIFT_MS = 3 * 60 * 1000

function nextWeather(): Weather {
  const r = Math.random()
  return r < 0.55 ? 'clear' : r < 0.8 ? 'mist' : 'meteors'
}

export function useSky() {
  const [sky, setSky] = useState<Sky>(() => {
    const saved = loadJson<Partial<Sky>>(KEY, {})
    return {
      followClock: saved.followClock ?? true,
      time: TIMES.includes(saved.time as TimeOfDay) ? (saved.time as TimeOfDay) : timeFromClock(),
      drift: saved.drift ?? false,
      weather: WEATHERS.includes(saved.weather as Weather) ? (saved.weather as Weather) : 'clear',
    }
  })

  useEffect(() => {
    saveJson(KEY, sky)
  }, [sky])

  // On the clock: check once a minute.
  useEffect(() => {
    if (!sky.followClock) return
    const tick = () => setSky((s) => (s.time === timeFromClock() ? s : { ...s, time: timeFromClock() }))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [sky.followClock])

  // Drifting weather.
  useEffect(() => {
    if (!sky.drift) return
    const id = setInterval(() => setSky((s) => ({ ...s, weather: nextWeather() })), DRIFT_MS)
    return () => clearInterval(id)
  }, [sky.drift])

  const step = <T,>(list: T[], current: T, by: number) => list[(list.indexOf(current) + by + list.length) % list.length]
  return {
    sky,
    stepTime: (by: number) => setSky((s) => ({ ...s, followClock: false, time: step(TIMES, s.time, by) })),
    stepWeather: (by: number) => setSky((s) => ({ ...s, drift: false, weather: step(WEATHERS, s.weather, by) })),
    setFollowClock: (on: boolean) => setSky((s) => ({ ...s, followClock: on, time: on ? timeFromClock() : s.time })),
    setDrift: (on: boolean) => setSky((s) => ({ ...s, drift: on })),
  }
}
