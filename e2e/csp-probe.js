// Served only by the local e2e harness. Browser-executed code, not a DevTools eval shortcut.
;(() => {
  const result = { evalAllowed: false, outsideRequestSucceeded: false }
  try { result.evalAllowed = new Function('return 2')() === 2 } catch { /* Expected in the demo. */ }
  fetch('https://example.invalid/zats-csp-probe')
    .then(() => { result.outsideRequestSucceeded = true })
    .catch(() => {})
    .finally(() => { window.__zatsCspProbe = result })
})()
