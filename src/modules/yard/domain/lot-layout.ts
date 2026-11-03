// ผังของลานจริง: แถวเรียงจากบนลงล่าง แต่ละแถวมีช่องจอดเรียงจากซ้ายไปขวา
// ทางรถเป็นแถวชนิด aisle; สิ่งที่ไม่ใช่ช่อง (ถนน ซุ้ม ที่จอดมอเตอร์ไซค์) เป็นป้ายกว้าง span ช่อง
// facing: UP = แถวอยู่เหนือทางรถ (ปากช่องหันลงล่าง), DOWN = แถวอยู่ใต้ทางรถ (ปากช่องหันขึ้นบน)
// ช่องที่ไม่อยู่ในผัง (เพิ่มใหม่ภายหลัง) หน้าเว็บต่อท้ายเป็นแถวสุดท้ายให้เอง
export type LayoutCell = { slot: string } | { label: string; span?: number };

export type LayoutRow =
  | { kind: 'slots'; facing: 'UP' | 'DOWN'; cells: LayoutCell[] }
  | { kind: 'aisle'; label?: string };

export type LotLayout = { rows: LayoutRow[] };
