import { useEffect, useRef, useState } from 'react'
import { DEMO } from './config'
import { connectSyrius, syriusProvider, SyriusError, type SyriusProvider, type SyriusSession } from './syrius'

/** Detect only; no wallet calls until a button is clicked. Every provider event retires old previews. */
export function useSyrius() {
  const [available, setAvailable] = useState(false)
  const [session, setSession] = useState<SyriusSession | null>(null)
  const [revision, setRevision] = useState(0)
  const [invalidated, setInvalidated] = useState(false)
  const selected = useRef(false)
  const epoch = useRef(0)
  const alive = useRef(false)
  const connecting = useRef(false)
  useEffect(() => {
    if (DEMO) return
    alive.current = true
    let provider: SyriusProvider | null = null
    const changed = () => {
      epoch.current++
      if (selected.current) setInvalidated(true)
      selected.current = false
      setSession(null)
      setRevision(epoch.current)
    }
    const events = ['accountsChanged', 'chainChanged', 'nodeChanged']
    const detach = () => events.forEach(event => provider?.removeListener(event, changed))
    const detect = () => {
      const next = syriusProvider()
      if (next !== provider) {
        detach(); changed(); provider = next
        events.forEach(event => provider?.on(event, changed))
      }
      setAvailable(!!next)
    }
    detect()
    window.addEventListener('zenon#initialized', detect)
    window.addEventListener('pageshow', changed)
    return () => {
      alive.current = false
      epoch.current++
      detach()
      window.removeEventListener('zenon#initialized', detect)
      window.removeEventListener('pageshow', changed)
    }
  }, [])
  const connect = async () => {
    if (connecting.current) throw new SyriusError('busy')
    const provider = syriusProvider()
    if (!provider) throw new SyriusError('missing')
    connecting.current = true
    try {
      const result = await connectSyrius(provider, () => epoch.current)
      if (!alive.current || !result.current()) throw new SyriusError('changed')
      selected.current = true
      setInvalidated(false)
      setSession(result)
      return result
    } finally { connecting.current = false }
  }
  return { available, session, revision, invalidated, connect }
}
