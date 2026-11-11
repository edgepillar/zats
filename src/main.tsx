import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Pixel type, Latin only: DotGothic16 for reading, Tiny5 for headings, buttons and big numbers,
// Silkscreen for small caps, VT323 for addresses. All have a Z that can't be read as a 2.
import '@fontsource/dotgothic16/latin-400.css'
import '@fontsource/tiny5/latin-400.css'
import '@fontsource/tiny5/latin-ext-400.css'
import '@fontsource/silkscreen/latin-400.css'
import '@fontsource/silkscreen/latin-700.css'
import '@fontsource/vt323/latin-400.css'
import './styles.css'
import { I18nProvider } from './i18n'
import { App } from './App'
import { DEMO, installDemo } from './demo'

// Demo builds talk to a pretend node inside the page instead of the Zenon network.
if (DEMO) installDemo()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
