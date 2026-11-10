<template>
  <!-- Kakaonut: claim sats hidden in a photo (paste or choose → scan → reveal → claim) -->
  <q-dialog
    v-model="showPhotoClaim"
    :maximized="$q.screen.lt.sm"
    transition-show="fade"
    transition-hide="fade"
    @show="onShow"
    @hide="onHide"
  >
    <q-card
      flat
      class="photo-claim column no-wrap"
      :class="$q.dark.isActive ? 'pc-dark' : 'pc-light'"
      data-testid="photo-claim"
    >
      <header class="pc-head">
        <button
          type="button"
          class="pc-close"
          :aria-label="$t('global.actions.close.label')"
          @click="close"
        >
          <XIcon :size="18" :stroke-width="2.25" />
        </button>
        <h2 class="pc-title">{{ $t("PhotoClaimDialog.title") }}</h2>
      </header>

      <!-- 1. Pick a photo -->
      <section
        v-if="stage === 'pick'"
        class="pc-pick col"
        :class="{ 'is-over': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <div class="pc-pick-main">
          <ImageIcon :size="40" :stroke-width="1.5" class="pc-pick-icon" />
          <p class="pc-intro">{{ $t("PhotoClaimDialog.intro") }}</p>
          <p v-if="!$q.platform.is.mobile" class="pc-hint">
            {{ $t("PhotoClaimDialog.drop") }}
          </p>
        </div>
        <div class="pc-actions">
          <p v-if="notice" class="pc-notice" role="status">{{ notice }}</p>
          <q-btn
            v-if="canPaste"
            unelevated
            rounded
            no-caps
            color="primary"
            class="pc-btn full-width"
            data-testid="photo-claim-paste"
            :label="$t('PhotoClaimDialog.paste')"
            @click="pasteFromClipboard"
          />
          <q-btn
            flat
            rounded
            no-caps
            class="pc-btn pc-quiet full-width"
            :label="$t('PhotoClaimDialog.choose')"
            @click="chooseFile"
          />
          <input
            ref="file"
            type="file"
            accept="image/*"
            hidden
            data-testid="photo-claim-input"
            @change="onFileInput"
          />
        </div>
      </section>

      <!-- 2–4. Scan, reveal, claim -->
      <section v-else class="pc-body col">
        <div class="pc-frame" :class="`is-${stage}`">
          <img :src="photoUrl" alt="" @load="photoLoaded = true" />
          <div class="pc-scan" />
          <transition name="pc-reveal">
            <div v-if="revealed" class="pc-reveal">
              <span
                class="pc-check"
                :class="{ 'is-on': stage === 'claimed' }"
                aria-hidden="true"
              >
                <CheckIcon :size="22" :stroke-width="2.75" />
              </span>
              <div class="pc-amount" data-testid="photo-claim-amount">
                {{ formatCurrency(shownAmount, unit) }}
              </div>
              <div class="pc-caption">{{ $t("PhotoClaimDialog.found") }}</div>
              <div class="pc-mint">
                {{ $t("PhotoClaimDialog.from_mint", { mint: mintHost }) }}
              </div>
            </div>
          </transition>
        </div>

        <div class="pc-foot">
          <p v-if="stage === 'scanning'" class="pc-status" role="status">
            {{ $t("PhotoClaimDialog.scanning") }}
          </p>

          <template v-else-if="stage === 'found' || stage === 'claiming'">
            <q-btn
              unelevated
              rounded
              no-caps
              color="primary"
              class="pc-btn full-width"
              :loading="stage === 'claiming'"
              data-testid="photo-claim-claim"
              @click="claim"
            >
              {{
                $t("PhotoClaimDialog.claim", {
                  amount: formatCurrency(amount, unit),
                })
              }}
              <template #loading>
                <q-spinner size="1.1em" class="q-mr-sm" />
                {{ $t("PhotoClaimDialog.claiming") }}
              </template>
            </q-btn>
            <p class="pc-note">{{ $t("PhotoClaimDialog.bearer") }}</p>
          </template>

          <template v-else-if="stage === 'claimed'">
            <p class="pc-done-title">{{ $t("PhotoClaimDialog.claimed") }}</p>
            <p class="pc-note" data-testid="photo-claim-received">
              {{ claimedText }}
            </p>
            <q-btn
              unelevated
              rounded
              no-caps
              color="primary"
              class="pc-btn full-width"
              :label="$t('PhotoClaimDialog.done')"
              @click="close"
            />
          </template>

          <template v-else-if="stage === 'failed'">
            <p class="pc-error" data-testid="photo-claim-error" role="alert">
              {{ error }}
            </p>
            <q-btn
              flat
              rounded
              no-caps
              class="pc-btn pc-quiet full-width"
              :label="$t('PhotoClaimDialog.again')"
              @click="startOver"
            />
          </template>
        </div>
      </section>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapWritableState } from "pinia";
import {
  Check as CheckIcon,
  Image as ImageIcon,
  X as XIcon,
} from "lucide-vue-next";
import { useKakaonutStore } from "src/stores/kakaonut";
import { useReceiveTokensStore } from "src/stores/receiveTokensStore";
import { useTokensStore } from "src/stores/tokens";
import token from "src/js/token";
import { readStickerFromFile } from "src/js/kakaonut/read";
import { FORMAT_NAMES } from "src/js/kakaonut/imageInfo";

/** The Kakaonut site's test photos carry this fake token (spec Phase 0). */
const isTestPayload = (t: string) =>
  t.startsWith("cashuB-KAKAONUT-TEST-DATA-NOT-MONEY-");

declare const windowMixin: any;

type Stage = "pick" | "scanning" | "found" | "claiming" | "claimed" | "failed";

/** One full sweep of the scan line. The reveal waits for it even if decoding is faster. */
const SCAN_MS = 1700;

const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export default defineComponent({
  name: "PhotoClaimDialog",
  mixins: [windowMixin],
  components: { CheckIcon, ImageIcon, XIcon },
  data() {
    return {
      stage: "pick" as Stage,
      photoUrl: "",
      photoLoaded: false,
      encodedToken: "",
      amount: 0,
      shownAmount: 0,
      received: 0,
      fee: 0,
      unit: "sat",
      mintHost: "",
      error: "",
      notice: "",
      dragOver: false,
      run: 0,
    };
  },
  computed: {
    ...mapWritableState(useKakaonutStore, ["showPhotoClaim", "photoFile"]),
    canPaste(): boolean {
      return typeof navigator !== "undefined" && !!navigator.clipboard?.read;
    },
    claimedText(): string {
      const amount = this.formatCurrency(this.received, this.unit);
      return this.fee > 0
        ? (this.$t("PhotoClaimDialog.claimed_fee", {
            amount,
            fee: this.formatCurrency(this.fee, this.unit),
          }) as string)
        : (this.$t("PhotoClaimDialog.claimed_body", { amount }) as string);
    },
    revealed(): boolean {
      return ["found", "claiming", "claimed"].includes(this.stage);
    },
  },
  watch: {
    photoFile(file: File | null) {
      if (file && this.showPhotoClaim) {
        this.photoFile = null;
        this.scan(file);
      }
    },
  },
  methods: {
    onShow() {
      // Opened with a photo already (pasted on the wallet page): start scanning straight away.
      const file = this.photoFile;
      this.photoFile = null;
      if (file) this.scan(file);
    },
    onHide() {
      this.run++;
      this.resetPhoto();
      this.stage = "pick";
      this.notice = "";
    },
    close() {
      this.showPhotoClaim = false;
    },
    startOver() {
      this.run++;
      this.resetPhoto();
      this.stage = "pick";
    },
    resetPhoto() {
      if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
      this.photoUrl = "";
      this.photoLoaded = false;
      this.encodedToken = "";
      this.amount = 0;
      this.shownAmount = 0;
      this.received = 0;
      this.fee = 0;
      this.error = "";
    },
    chooseFile() {
      (this.$refs.file as HTMLInputElement | undefined)?.click();
    },
    onFileInput(e: Event) {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (file) this.scan(file);
    },
    onDrop(e: DragEvent) {
      this.dragOver = false;
      const file = Array.from(e.dataTransfer?.files ?? []).find(
        (f) => f.type.startsWith("image/") || f.type === ""
      );
      if (file) this.scan(file);
    },
    async pasteFromClipboard() {
      this.notice = "";
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type =
            item.types.find((t) => t === "image/png") ??
            item.types.find((t) => t.startsWith("image/"));
          if (!type) continue;
          const blob = await item.getType(type);
          this.scan(new File([blob], "pasted", { type }));
          return;
        }
        this.notice = this.$t("PhotoClaimDialog.errors.paste_empty") as string;
      } catch {
        this.notice = this.$t("PhotoClaimDialog.errors.paste_denied") as string;
      }
    },
    async scan(file: File) {
      const run = ++this.run;
      this.resetPhoto();
      this.photoUrl = URL.createObjectURL(file);
      this.stage = "scanning";

      const sweep = new Promise((r) =>
        setTimeout(r, reducedMotion() ? 0 : SCAN_MS)
      );
      let result;
      try {
        result = await readStickerFromFile(file);
      } catch {
        result = null;
      }
      await sweep;
      if (run !== this.run) return;

      if (!result) return this.fail("unreadable");
      if (!result.ok) {
        const format =
          result.format === "unknown" ? "?" : FORMAT_NAMES[result.format];
        return this.fail(result.reason, { format });
      }

      // The fake payload in the site's test photos (and anything else that isn't a real token)
      // fails to decode: say so instead of hanging on "Scanning…".
      let meta;
      try {
        meta = token.decodeMeta(result.token);
      } catch {
        meta = undefined;
      }
      if (!meta)
        return this.fail(
          isTestPayload(result.token) ? "test_photo" : "unreadable"
        );
      const seen = useTokensStore().tokenAlreadyInHistory(result.token);
      if (seen && (seen.amount > 0 || seen.status === "paid")) {
        return this.fail("already");
      }

      this.encodedToken = result.token;
      this.amount = meta.amount;
      this.unit = meta.unit || "sat";
      this.mintHost = hostOf(meta.mint);
      this.stage = "found";
      this.countUp(run);
    },
    countUp(run: number) {
      if (reducedMotion()) {
        this.shownAmount = this.amount;
        return;
      }
      const start = performance.now();
      const duration = 900;
      const tick = (now: number) => {
        if (run !== this.run) return;
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        this.shownAmount = Math.round(this.amount * eased);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    async claim() {
      if (!this.encodedToken || this.stage !== "found") return;
      const run = this.run;
      this.stage = "claiming";
      const receiveStore = useReceiveTokensStore();
      receiveStore.receiveData.tokensBase64 = this.encodedToken;
      try {
        // The normal cashu.me receive path: adds the mint if needed, then redeems.
        await receiveStore.receiveToken(this.encodedToken);
        if (run !== this.run) return;
        // What actually arrived, after the mint's fee (recorded by the normal receive path).
        const entry = useTokensStore().tokenAlreadyInHistory(this.encodedToken);
        this.received = entry && entry.amount > 0 ? entry.amount : this.amount;
        this.fee = Math.max(0, this.amount - this.received);
        this.shownAmount = this.amount;
        this.stage = "claimed";
      } catch (e: any) {
        if (run !== this.run) return;
        const message = String(e?.message ?? e);
        if (/spent/i.test(message)) this.fail("spent");
        else this.fail("claim_failed", { error: message });
      }
    },
    fail(reason: string, vars: Record<string, string> = {}) {
      this.error = this.$t(`PhotoClaimDialog.errors.${reason}`, vars) as string;
      this.stage = "failed";
    },
  },
});

function hostOf(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url;
  }
}
</script>

<style scoped>
/* Kakaonut: quiet sheet, no shadows, system greys. Button shape and yellow come from the kakaonut theme (css/base.scss). */
.photo-claim {
  width: 100%;
  max-width: 420px;
  min-height: min(640px, 100%);
  border-radius: 8px;
}
.q-dialog__inner--maximized .photo-claim {
  max-width: none;
  border-radius: 0;
}
.pc-light {
  --pc-fg: #1d1d1f;
  --pc-secondary: #6e6e73;
  --pc-fill: rgba(120, 120, 128, 0.12);
  --pc-fill-strong: rgba(120, 120, 128, 0.2);
  --pc-frame: #f5f5f7;
  background: #fff;
  color: var(--pc-fg);
}
.pc-dark {
  --pc-fg: #f5f5f7;
  --pc-secondary: #98989d;
  --pc-fill: rgba(120, 120, 128, 0.24);
  --pc-fill-strong: rgba(120, 120, 128, 0.34);
  --pc-frame: #2c2c2e;
  background: #1c1c1e;
  color: var(--pc-fg);
}

.pc-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
  padding: 8px 60px 0;
}
.pc-close {
  position: absolute;
  left: 16px;
  top: 50%;
  margin-top: 4px;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--pc-fill);
  color: var(--pc-secondary);
  cursor: pointer;
  transition: background 0.2s;
}
.pc-close:hover {
  background: var(--pc-fill-strong);
}
.pc-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.pc-btn {
  min-height: 52px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.pc-quiet {
  background: var(--pc-fill) !important;
  color: var(--pc-fg) !important;
}

/* 1. Pick */
.pc-pick {
  display: flex;
  flex-direction: column;
  margin: 4px 12px 12px;
  padding: 0 12px 12px;
  border-radius: 6px;
  transition: background 0.2s;
}
.pc-pick.is-over {
  background: var(--pc-fill);
}
.pc-pick-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 8px;
  text-align: center;
}
.pc-pick-icon {
  color: var(--pc-secondary);
}
.pc-intro {
  margin: 0;
  max-width: 290px;
  font-size: 17px;
  line-height: 1.45;
}
.pc-hint {
  margin: 0;
  font-size: 13px;
  color: var(--pc-secondary);
}
.pc-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pc-notice {
  margin: 0 0 4px;
  text-align: center;
  font-size: 14px;
  color: var(--pc-secondary);
}

/* 2–4. Photo */
.pc-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px 20px 24px;
}
.pc-frame {
  position: relative;
  flex: 1 1 auto;
  min-height: 240px;
  max-height: 56vh;
  border-radius: 6px;
  overflow: hidden;
  background: var(--pc-frame);
}
.pc-frame img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 0.8s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Scanning: a fine line with a soft light trail moves down the photo. */
.pc-scan {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 36%;
  pointer-events: none;
  opacity: 0;
  transform: translateY(-100%);
  background: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0),
    rgba(255, 255, 255, 0.2)
  );
  border-bottom: 1.5px solid rgba(255, 255, 255, 0.95);
}
.is-scanning img {
  filter: brightness(0.88);
}
.is-scanning .pc-scan {
  opacity: 1;
  animation: pc-sweep 1.7s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
@keyframes pc-sweep {
  from {
    top: 0;
    transform: translateY(-100%);
  }
  to {
    top: 100%;
    transform: translateY(0);
  }
}

/* Reveal: the photo melts into a blur and the amount resolves out of it. */
.is-found img,
.is-claiming img,
.is-claimed img {
  filter: blur(20px) brightness(0.55) saturate(1.3);
  transform: scale(1.1);
}
.is-failed img {
  filter: grayscale(1) brightness(0.6);
}
.pc-reveal {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  color: #fff;
  text-align: center;
}
.pc-check {
  width: 40px;
  height: 40px;
  margin-bottom: 14px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #30d158;
  color: #fff;
  opacity: 0;
  transform: scale(0.6);
  transition: opacity 0.3s ease, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.pc-check.is-on {
  opacity: 1;
  transform: none;
}
.pc-amount {
  font-size: clamp(40px, 11vw, 52px);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.pc-caption {
  margin-top: 10px;
  font-size: 15px;
  font-weight: 500;
  opacity: 0.92;
}
.pc-mint {
  margin-top: 2px;
  font-size: 13px;
  opacity: 0.7;
}
.pc-reveal-enter-active {
  transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s,
    transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.1s;
}
.pc-reveal-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.pc-foot {
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: center;
}
.pc-status {
  margin: 14px 0;
  font-size: 15px;
  color: var(--pc-secondary);
}
.pc-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--pc-secondary);
}
.pc-done-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.pc-done-title + .pc-note {
  margin: -6px 0 4px;
  font-size: 15px;
}
.pc-error {
  margin: 0 0 4px;
  font-size: 16px;
  line-height: 1.45;
}

@media (prefers-reduced-motion: reduce) {
  .is-scanning .pc-scan {
    animation: none;
    opacity: 0;
  }
  .pc-frame img,
  .pc-check,
  .pc-reveal-enter-active {
    transition: none;
  }
}

/* Short screens (a phone held sideways): the sheet scrolls and drops decoration so the buttons
   stay reachable. */
@media (max-height: 520px) {
  .photo-claim {
    min-height: 0;
    max-height: 100%;
    overflow-y: auto;
  }
  .pc-head {
    min-height: 48px;
  }
  .pc-pick-main {
    padding: 8px;
  }
  .pc-pick-icon {
    display: none;
  }
  .pc-frame {
    min-height: 160px;
    max-height: 48vh;
  }
}
</style>
