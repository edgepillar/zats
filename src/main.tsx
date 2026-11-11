import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import '@fontsource/bricolage-grotesque/latin-800.css'
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
