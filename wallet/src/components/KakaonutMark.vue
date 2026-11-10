<template>
  <!-- Kakaonut: brown K on yellow, with the wordmark (Bricolage Grotesque) -->
  <span class="kakaonut-mark" aria-label="Kakaonut">
    <span class="kakaonut-mark__k" aria-hidden="true">K</span>
    <span class="kakaonut-mark__word" aria-hidden="true">Kakaonut</span>
  </span>
</template>

<script lang="ts">
import { defineComponent } from "vue";
// Without ".css": Vite 2 resolves this package's "./*" export pattern first.
import "@fontsource/bricolage-grotesque/latin-800";

export default defineComponent({
  name: "KakaonutMark",
});
</script>

<style scoped>
.kakaonut-mark {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: "Bricolage Grotesque", system-ui, sans-serif;
  font-weight: 800;
}
.kakaonut-mark__k {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 28%;
  background: #fee500;
  color: #3b1e1e;
  font-size: 20px;
  line-height: 1;
}
.kakaonut-mark__word {
  font-size: 19px;
  letter-spacing: -0.02em;
}
</style>
