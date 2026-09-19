/**
 * ตัวเลือกผู้เล่นฝั่งตรงข้ามที่เลือกได้จริง (LSN-0048)
 *
 * ก๊วนที่รู้จักกันมักมีคนซ้ำกันอยู่ทั้งสองก๊วน ฟอร์มบันทึกผลจึงยอมให้เลือกคนคนเดียว
 * ไว้ทั้งสองฝั่งได้ ฐานข้อมูลปฏิเสธด้วย constraint `matches_no_player_on_both_sides`
 * (LSN-0030) แต่ผู้ใช้เห็นแค่ "เกิดข้อผิดพลาด" ที่ทำอะไรต่อไม่ถูก
 *
 * ตัดออกตั้งแต่ตัวเลือก ดีกว่าปล่อยให้เลือกแล้วค่อยบอกว่าผิด — คนที่เลือกไม่ได้
 * อยู่แล้วไม่ควรโผล่มาให้เลือก
 *
 * คืน `selected` มาด้วย เพราะถ้าคนที่เลือกไว้ก่อนหน้าหายไปจากรายการ ช่องจะค้าง
 * ที่ค่าที่ไม่มีอยู่แล้ว แล้วกดส่งไปเจอ error เดิมอีก
 */
export function opponentChoice<T extends { id: string }>(
  opponents: readonly T[],
  ownSidePlayer: string,
  current: string,
): { options: T[]; selected: string } {
  const options = opponents.filter((player) => player.id !== ownSidePlayer);
  const selected = options.some((player) => player.id === current)
    ? current
    : (options[0]?.id ?? '');

  return { options, selected };
}
