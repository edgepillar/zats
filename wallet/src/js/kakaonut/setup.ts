import { useWelcomeStore } from "src/stores/welcome";
import { useMintsStore } from "src/stores/mints";
import {
  DEFAULT_MINT_NICKNAME,
  DEFAULT_MINT_URL,
} from "src/js/kakaonut/config";

/**
 * Kakaonut: mark onboarding as done so the wallet opens straight to the home screen. The seed
 * phrase is still generated (by WalletPage) and can be viewed in Settings → Backup.
 */
export function skipOnboarding(): void {
  const welcome = useWelcomeStore();
  if (!welcome.showWelcome && welcome.termsAccepted) return;
  welcome.termsAccepted = true;
  if (!welcome.onboardingPath) welcome.onboardingPath = "new";
  welcome.currentSlide = 0;
  welcome.showWelcome = false;
}

/**
 * Kakaonut: a wallet with no mints at all gets the default mint, so it always opens ready to
 * use. Someone who adds their own mints can still remove this one. A failed attempt (offline)
 * is retried on the next start.
 */
export async function ensureDefaultMint(): Promise<void> {
  const mints = useMintsStore();
  if (mints.mints.length > 0) return;
  try {
    await mints.addMint({
      url: DEFAULT_MINT_URL,
      nickname: DEFAULT_MINT_NICKNAME,
    });
  } catch (e) {
    console.warn("Kakaonut: could not add the default mint yet", e);
  }
}
