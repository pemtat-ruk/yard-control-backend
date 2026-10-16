// ค่าจาก environment ทั้งหมดอ่านที่นี่ที่เดียว — ไฟล์อื่นห้ามอ่าน process.env ตรงๆ
// ค่าที่ผิดทำให้แอปไม่เริ่มทำงาน ดีกว่ารันต่อด้วยค่าผิดโดยไม่มีใครรู้
const DEFAULT_PORT = 4000;
const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';
const DEFAULT_PRICE_PER_SLOT_ROUND = 100;
const DEFAULT_TRUST_PROXY_HOPS = 0;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX = 300;
const DEFAULT_LOG_LEVEL = 'info';
const TEST_LOG_LEVEL = 'silent';
const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
];
const ANY_ORIGIN = '*';
const DEV_AUTH_SECRET = 'dev-only-secret-change-me-in-production';
const MIN_AUTH_SECRET_LENGTH = 32;
const DEFAULT_SESSION_TTL_HOURS = 8;
const DEFAULT_QR_TTL_MINUTES = 15;
const DEFAULT_FINE_PAYMENT_DAYS = 7;
const DEFAULT_NOTIFY_BEFORE_MINUTES = 15;
const DEFAULT_TRANSACTION_PREFIX = 'YCS';
const EXTERNAL_MODES = ['mock'];

type EnvSource = Record<string, string | undefined>;
type NumberRule = { min: number; integer: boolean };

const POSITIVE_INTEGER: NumberRule = { min: 1, integer: true };
const NON_NEGATIVE_INTEGER: NumberRule = { min: 0, integer: true };

export function loadEnv(source: EnvSource = process.env) {
  const problems: string[] = [];
  // ค่าว่าง ("") ใน .env นับว่าไม่ได้ตั้ง
  const read = (name: string) => source[name] || undefined;

  const readNumber = (name: string, fallback: number, rule: NumberRule) => {
    const raw = read(name);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    const valid =
      Number.isFinite(value) &&
      value >= rule.min &&
      (!rule.integer || Number.isInteger(value));
    if (!valid) {
      problems.push(
        `${name} must be ${rule.integer ? 'an integer' : 'a number'} >= ${rule.min}`,
      );
    }
    return value;
  };

  const nodeEnv = read('NODE_ENV') ?? 'development';
  const isProduction = nodeEnv === 'production';

  // origin ของ frontend ที่อนุญาตให้เรียก API (คั่นด้วย , ได้หลายค่า)
  const webOrigins = (read('WEB_ORIGIN') ?? DEFAULT_WEB_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (webOrigins.includes(ANY_ORIGIN)) {
    // API ส่ง cookie ข้าม origin (credentials) จึงต้องระบุ origin ให้ชัด
    problems.push('WEB_ORIGIN must list explicit origins, not "*"');
  }

  const logLevel =
    read('LOG_LEVEL') ??
    (nodeEnv === 'test' ? TEST_LOG_LEVEL : DEFAULT_LOG_LEVEL);
  if (!LOG_LEVELS.includes(logLevel)) {
    problems.push(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}`);
  }

  // production ห้ามพึ่งค่าตั้งต้นของเครื่องนักพัฒนา
  if (isProduction) {
    for (const name of ['WEB_ORIGIN', 'DATABASE_URL', 'AUTH_SECRET']) {
      if (read(name) === undefined) {
        problems.push(`${name} is required in production`);
      }
    }
  }

  const authSecret = read('AUTH_SECRET') ?? DEV_AUTH_SECRET;
  if (authSecret.length < MIN_AUTH_SECRET_LENGTH) {
    problems.push(
      `AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters`,
    );
  }

  // ตัวเชื่อมระบบภายนอก: ตอนนี้มีแค่ตัวจำลอง รอ spec จริงของ CRM และ Payment Gateway
  const readMode = (name: string) => {
    const mode = read(name) ?? 'mock';
    if (!EXTERNAL_MODES.includes(mode)) {
      problems.push(`${name} must be one of: ${EXTERNAL_MODES.join(', ')}`);
    }
    return mode;
  };

  const env = {
    nodeEnv,
    isProduction,
    port: readNumber('PORT', DEFAULT_PORT, POSITIVE_INTEGER),
    webOrigins,
    // จำนวน reverse proxy หน้าแอป — ใช้หา IP จริงของ client สำหรับ rate limit และ log
    trustProxyHops: readNumber(
      'TRUST_PROXY_HOPS',
      DEFAULT_TRUST_PROXY_HOPS,
      NON_NEGATIVE_INTEGER,
    ),
    databaseUrl: read('DATABASE_URL'),
    logLevel,
    rateLimitWindowMs: readNumber(
      'RATE_LIMIT_WINDOW_MS',
      DEFAULT_RATE_LIMIT_WINDOW_MS,
      POSITIVE_INTEGER,
    ),
    rateLimitMax: readNumber(
      'RATE_LIMIT_MAX',
      DEFAULT_RATE_LIMIT_MAX,
      POSITIVE_INTEGER,
    ),
    // อัตราที่ใช้เมื่อยังไม่มีแถวใน rate_configs ที่มีผลบังคับ
    pricePerSlotRound: readNumber(
      'DEFAULT_PRICE_PER_SLOT_ROUND',
      DEFAULT_PRICE_PER_SLOT_ROUND,
      { min: 0, integer: false },
    ),
    authSecret,
    sessionTtlHours: readNumber(
      'SESSION_TTL_HOURS',
      DEFAULT_SESSION_TTL_HOURS,
      POSITIVE_INTEGER,
    ),
    crmMode: readMode('CRM_MODE'),
    paymentGatewayMode: readMode('PAYMENT_GATEWAY_MODE'),
    transactionPrefix: read('TRANSACTION_PREFIX') ?? DEFAULT_TRANSACTION_PREFIX,
    // อายุ QR ของการจอง: หมดแล้วปล่อยช่องจอดที่ถือไว้
    qrTtlMinutes: readNumber(
      'QR_TTL_MINUTES',
      DEFAULT_QR_TTL_MINUTES,
      POSITIVE_INTEGER,
    ),
    finePaymentDays: readNumber(
      'FINE_PAYMENT_DAYS',
      DEFAULT_FINE_PAYMENT_DAYS,
      POSITIVE_INTEGER,
    ),
    // ข้อ 4: แจ้งเตือนผู้ขอใช้บริการล่วงหน้าก่อนหมดเวลาจอด
    notifyBeforeMinutes: readNumber(
      'NOTIFY_BEFORE_MINUTES',
      DEFAULT_NOTIFY_BEFORE_MINUTES,
      POSITIVE_INTEGER,
    ),
    // งานตามเวลา (ยกเลิกอัตโนมัติ, แจ้งเตือน) — ปิดได้เมื่อรันหลาย instance แล้วให้ตัวเดียวทำ
    runJobs: (read('RUN_JOBS') ?? 'true') === 'true',
  };

  if (problems.length > 0) {
    throw new Error(`Invalid environment:\n- ${problems.join('\n- ')}`);
  }
  return env;
}

export const env = loadEnv();
