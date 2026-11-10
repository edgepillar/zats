import { defineStore } from "pinia";

/** Kakaonut: state for the "claim sats from a photo" dialog. */
export const useKakaonutStore = defineStore("kakaonut", {
  state: () => ({
    showPhotoClaim: false,
    /** A photo handed over by a paste or drop, to start scanning right away. */
    photoFile: null as File | null,
  }),
  actions: {
    openPhotoClaim(file?: File | null) {
      this.photoFile = file ?? null;
      this.showPhotoClaim = true;
    },
  },
});
