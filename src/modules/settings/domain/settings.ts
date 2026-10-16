// ข้อ 2 ฟังก์ชันตั้งค่าระบบ (ฝ่าย IT) และข้อ 7 รหัสเริ่มต้นของธุรกรรม
// ค่าที่ยังไม่เคยบันทึกในฐานข้อมูลใช้ค่าตั้งต้นจาก env
export type Settings = {
  transactionPrefix: string;
  qrTtlMinutes: number;
  finePaymentDays: number;
  notifyBeforeMinutes: number;
  // ตัวคูณของสูตรค่าปรับจอดเกินเวลา (modules/fine/domain/fine-amount.ts)
  fineMultiplier: number;
};

export type SettingKey = keyof Settings;

export const SETTING_KEYS: SettingKey[] = [
  'transactionPrefix',
  'qrTtlMinutes',
  'finePaymentDays',
  'notifyBeforeMinutes',
  'fineMultiplier',
];

// รหัสนำหน้าเลขธุรกรรม: ตัวอักษรอังกฤษพิมพ์ใหญ่หรือตัวเลข 2–10 ตัว (เลขธุรกรรมเก็บได้ 50 ตัว)
export const TRANSACTION_PREFIX_PATTERN = /^[A-Z0-9]{2,10}$/;

// ช่วงค่าที่ยอมรับของค่าที่เป็นตัวเลข
export const NUMBER_LIMITS: Record<
  Exclude<SettingKey, 'transactionPrefix'>,
  { min: number; max: number }
> = {
  qrTtlMinutes: { min: 1, max: 60 },
  finePaymentDays: { min: 1, max: 90 },
  notifyBeforeMinutes: { min: 1, max: 120 },
  fineMultiplier: { min: 1, max: 10 },
};

function isValid(key: SettingKey, value: string): boolean {
  if (key === 'transactionPrefix')
    return TRANSACTION_PREFIX_PATTERN.test(value);
  const number = Number(value);
  const { min, max } = NUMBER_LIMITS[key];
  return Number.isInteger(number) && number >= min && number <= max;
}

// รวมค่าที่บันทึกไว้ทับค่าตั้งต้น — แถวที่ไม่รู้จักหรือค่าผิดรูปแบบถูกข้าม (ใช้ค่าตั้งต้นแทน)
export function mergeSettings(
  defaults: Settings,
  rows: { key: string; value: string }[],
): Settings {
  const merged = { ...defaults };
  for (const { key, value } of rows) {
    if (!SETTING_KEYS.includes(key as SettingKey)) continue;
    const settingKey = key as SettingKey;
    if (!isValid(settingKey, value)) continue;
    if (settingKey === 'transactionPrefix') merged.transactionPrefix = value;
    else merged[settingKey] = Number(value);
  }
  return merged;
}
