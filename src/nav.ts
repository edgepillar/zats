import type { MouseEvent } from 'react'
import { prefersReducedMotion } from './hooks'

/**
 * The home page's two actions. #hide and #redeem open the action card in that mode (and scroll
 * to it), from anywhere on the site; #make is the old name for #hide.
 */
export type Mode = 'hide' | 'redeem'

export function modeFromHash(hash: string): Mode | null {
  if (hash === '#redeem') return 'redeem'
  if (hash === '#hide' || hash === '#make') return 'hide'
  return null
}

export function scrollToActions(smooth = true) {
  document.getElementById('make')?.scrollIntoView({
    block: 'start',
    behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto',
  })
}

/** For links to #hide / #redeem: following the same link twice still scrolls to the card. */
export function goToMode(mode: Mode, e?: MouseEvent) {
  if (location.hash === `#${mode}`) {
    e?.preventDefault()
    scrollToActions()
  }
}

/** A link to the redeem page that works wherever the site is hosted. */
export function redeemUrl(): string {
  return `${location.origin}${location.pathname}#redeem`
}
