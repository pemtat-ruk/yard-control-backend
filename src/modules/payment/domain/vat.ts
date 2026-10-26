// ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ (Screen Design หน้า 18–19): ค่าบริการและค่าปรับเป็นราคารวมภาษีมูลค่าเพิ่มแล้ว
// อัตราตามประมวลรัษฎากร (ปัจจุบันร้อยละ 7)
export const VAT_RATE_PERCENT = 7;

const SATANG_PER_BAHT = 100;
const PERCENT = 100;

export type VatBreakdown = {
  ratePercent: number;
  beforeVat: number;
  vat: number;
};

// แยกภาษีออกจากยอดรวมภาษี: ภาษี = ยอด × อัตรา / (100 + อัตรา) ปัดเป็นสตางค์
// มูลค่าก่อนภาษีคือส่วนที่เหลือ สองส่วนรวมกันเท่ายอดเดิมเสมอ (ไม่คลาดสตางค์จากการปัดสองครั้ง)
export function vatIncluded(
  total: number,
  ratePercent: number = VAT_RATE_PERCENT,
): VatBreakdown {
  const totalSatang = Math.round(total * SATANG_PER_BAHT);
  const vatSatang = Math.round(
    (totalSatang * ratePercent) / (PERCENT + ratePercent),
  );
  return {
    ratePercent,
    beforeVat: (totalSatang - vatSatang) / SATANG_PER_BAHT,
    vat: vatSatang / SATANG_PER_BAHT,
  };
}
