// Kakaonut: Korean locale. Covers the photo-claim flow and the main wallet buttons; everything
// else falls back to en-US. Needs a native speaker's review.
export default {
  global: {
    copy_to_clipboard: {
      success: "클립보드에 복사했어요!",
    },
    actions: {
      add_mint: { label: "민트 추가" },
      cancel: { label: "취소" },
      copy: { label: "복사" },
      close: { label: "닫기" },
      enter: { label: "입력" },
      lock: { label: "잠금" },
      paste: { label: "붙여넣기" },
      receive: { label: "받기" },
      scan: { label: "스캔" },
      send: { label: "보내기" },
      pay: { label: "결제" },
      swap: { label: "교환" },
      update: { label: "업데이트" },
    },
  },
  WalletPage: {
    actions: {
      photo: { label: "사진 붙여넣기" },
      send: { label: "@:global.actions.send.label" },
      receive: { label: "@:global.actions.receive.label" },
    },
    tabs: {
      history: { label: "내역" },
      invoices: { label: "인보이스" },
      mints: { label: "민트" },
    },
  },
  ReceiveDialog: {
    title: "받기",
    actions: {
      ecash: {
        label: "이캐시",
        error_no_mints: "사용할 수 있는 민트가 없어요",
      },
      lightning: {
        label: "라이트닝",
        error_no_mints: "라이트닝으로 받으려면 민트를 연결해야 해요",
      },
    },
  },
  ReceiveEcashDrawer: {
    title: "이캐시 받기",
    actions: {
      paste: { label: "@:global.actions.paste.label" },
      scan: { label: "@:global.actions.scan.label" },
      photo: { label: "사진" },
      request: { label: "요청" },
    },
  },
  PhotoClaimDialog: {
    title: "사진 속 비트코인",
    intro:
      "비트코인이 숨은 사진을 받았나요? 붙여넣거나 고르면 지갑이 사진 안을 들여다봐요.",
    paste: "사진 붙여넣기",
    choose: "사진 고르기",
    drop: "또는 여기에 끌어다 놓으세요",
    scanning: "사진을 스캔하는 중…",
    found: "이 사진에서 찾았어요",
    from_mint: "{mint}에서 발행",
    claim: "{amount} 받기",
    claiming: "받는 중…",
    claimed: "받았어요!",
    claimed_body: "{amount}가 지갑에 들어왔어요.",
    claimed_fee: "{amount}가 지갑에 들어왔어요 (민트 수수료 {fee}).",
    done: "확인",
    again: "다른 사진으로 해보기",
    bearer:
      "이 사진을 가진 사람은 누구나 비트코인을 받을 수 있어요. 지금 받아 두세요.",
    errors: {
      erased:
        "사진이 {format}로 변환돼서 숨긴 비트코인이 지워졌어요. 보낸 사람에게 원본 화질이나 파일로 다시 보내 달라고 해주세요.",
      damaged: "숨긴 비트코인이 오는 길에 손상됐어요.",
      none: "이 이미지에서는 비트코인을 찾지 못했어요.",
      unreadable: "이미지로 읽을 수 없는 파일이에요.",
      already: "이 사진의 비트코인은 이미 받았어요.",
      spent: "이미 누군가 받아 간 비트코인이에요.",
      claim_failed: "받지 못했어요: {error}",
      paste_empty: "클립보드에 이미지가 없어요.",
      test_photo:
        "카카오넛 테스트 사진이에요. 숨긴 데이터는 무사히 도착했지만 가짜라서 비트코인은 없어요.",
      paste_denied: "붙여넣기가 막혔어요. 사진을 골라 주세요.",
    },
  },
};
