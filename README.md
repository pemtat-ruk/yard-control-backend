# Yard Control System (YCS) — Backend

REST API ของระบบลานจอดรถจัดเรียงสินค้า: กติกาธุรกิจ ฐานข้อมูล และการเชื่อมต่อระบบภายนอก (CRM, Payment Gateway)

หน้าจออยู่ที่โปรเจค `yard-control-system` ซึ่งมีสรุป requirement (README.md) และรายการงานทั้งระบบ (CHECKLIST.md)

## Tech Stack

- **NestJS 12** (TypeScript, ESM)
- **PostgreSQL + Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **class-validator** ตรวจ request, **Swagger** สร้างเอกสาร API
- **Vitest** + supertest สำหรับ unit และ e2e test, **oxlint** + Prettier
- **helmet** (security header), **@nestjs/throttler** (rate limit), **pino** (log แบบ JSON)

## เริ่มต้นใช้งาน

ต้องมี Node.js 22 ขึ้นไป และ PostgreSQL

```bash
npm install
cp .env.example .env      # แก้ DATABASE_URL ให้ตรงกับเครื่อง
docker compose up -d      # PostgreSQL สำหรับพัฒนา (ถ้ายังไม่มีฐานข้อมูล)
npm run db:migrate        # สร้างตารางจาก prisma/schema.prisma
npm run db:seed           # ลานจอด A, B และบัญชีพนักงาน CS001 / YD001 / IT001
npm run start:dev         # http://localhost:4000
```

ตรวจสถานะได้ที่ `/api/v1/health` (process ยังทำงาน) และ `/api/v1/ready` (ฐานข้อมูลพร้อม)

ค่าใน `.env` ที่ผิดรูปแบบทำให้แอปไม่เริ่มทำงานและแจ้งทุกข้อที่ผิดพร้อมกัน เมื่อ `NODE_ENV=production` ต้องตั้ง `WEB_ORIGIN` และ `DATABASE_URL` เอง

| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run start:dev` | รันแบบ watch |
| `npm run build` / `npm run start:prod` | build และรัน production |
| `npm test` / `npm run test:e2e` | unit test / e2e test |
| `npm run lint` / `npm run typecheck` / `npm run format` | ตรวจและจัดรูปแบบโค้ด |
| `npm run db:migrate` / `db:deploy` / `db:studio` | จัดการฐานข้อมูล |
| `npm run db:seed` | ข้อมูลตั้งต้นสำหรับเครื่องพัฒนา (รันซ้ำได้) รหัสผ่านพนักงานอยู่ใน `SEED_EMPLOYEE_PASSWORD` |

## API

Base URL: `http://localhost:4000/api/v1` — เอกสารแบบลองยิงได้: `http://localhost:4000/api/docs`

| Method | Path | สิทธิ์ | ทำอะไร |
|---|---|---|---|
| GET | `/health`, `/ready` | เปิด | สถานะระบบ / พร้อมรับ request (503 เมื่อฐานข้อมูลล่ม) |
| POST | `/auth/login` | เปิด | เข้าสู่ระบบ ได้ session cookie แบบ httpOnly — ผู้ขอใช้บริการถูกตรวจกับ CRM ทุกครั้ง พบแล้วเพิ่ม/อัปเดตข้อมูลใน YCS ให้เอง ไม่พบได้ `REGISTER_NOT_IN_CRM` |
| POST | `/auth/register` | เปิด | ลงทะเบียนเปิดสิทธิ์ (ต้องพบข้อมูลใน CRM) |
| POST | `/auth/logout` | เปิด | ออกจากระบบ |
| GET | `/auth/me` | login | ผู้ใช้ที่ login อยู่และสิทธิ์ที่มี |
| GET | `/rounds` | เปิด | รอบการจอง วันนี้ตามเวลาไทย จำนวนวันจองล่วงหน้า |
| GET / POST | `/rounds/configs` | PRICING_MANAGE หรือ SETTINGS_MANAGE | ตารางรอบแบบมีผลตั้งแต่วันที่ (เวลาเริ่มรอบแรก + ชั่วโมงต่อรอบที่หาร 24 ลงตัว) พร้อม `earliest` = วันแรกที่ตั้งได้ (พ้นช่วงจองล่วงหน้าและพ้นวันสุดท้ายที่มีการจองใช้) |
| DELETE | `/rounds/configs/:id` | PRICING_MANAGE หรือ SETTINGS_MANAGE | ยกเลิกตารางรอบที่ยังไม่เปิดให้จอง |
| POST | `/bookings/quote` | เปิด | คำนวณยอดและตารางชำระเงินก่อนยืนยัน (`skipDates` = วันในช่วงที่ไม่จอง) |
| POST | `/bookings` | จองเอง / จองแทน | สร้างการจองและรายการรอชำระ — จองข้ามวันได้ด้วย `skipDates` (ต้องอยู่ระหว่างวันแรกกับวันสุดท้าย) |
| GET | `/bookings`, `/bookings/:id` | login | ของตนเอง หรือทั้งหมดพร้อมค้นหา (`?q=`) สำหรับพนักงาน |
| POST | `/bookings/:id/pay-days` | login | ชำระค่าบริการรายวันของการจองแบบวันต่อวัน |
| GET | `/customers` | จองแทน | ค้นหาผู้ขอใช้บริการ |
| GET | `/yard/availability` | login | สถานะช่องจอด ณ ช่วงเวลาที่จะจอง (`skipDates=2026-09-02,2026-09-03`) |
| GET | `/yard/availability/summary` | login | จำนวนช่องว่างของทุกรอบเริ่ม (ช่วงวันเดิม) และทุกวันที่จองล่วงหน้าได้ (รอบเดิม) — query เดียวกับ `/yard/availability`; `available: null` = จองไม่ได้ตามกติกา |
| POST | `/bookings/import/preview` | BOOKING_IMPORT_LONG_TERM | ตรวจไฟล์ CSV นำเข้าการจองลูกค้าประจำรายแถวโดยยังไม่บันทึก (`{ csv }`) — หาคอลัมน์จากชื่อไทยหรืออังกฤษ, คั่นด้วย , หรือ ;, รับค่าที่ Excel แปลง (เบอร์ไม่มี 0 นำหน้า, วันที่ วัน/เดือน/ปี พ.ศ., เวลา 7:00:00), ข้ามแถวที่ขึ้นต้นด้วย # |
| POST | `/bookings/import` | BOOKING_IMPORT_LONG_TERM | นำเข้าทั้งไฟล์ใน transaction เดียว (ต้องผ่านทุกแถว) — ชำระแบบวันต่อวัน ไม่มียอดชำระทันที แต่ละวันกำหนดชำระเที่ยงคืนก่อนวันใช้งาน |
| GET / PUT | `/settings` | SETTINGS_MANAGE | ค่าตั้งค่าระบบ: Transaction Prefix, อายุ QR, ระยะชำระค่าปรับ, เวลาแจ้งเตือนก่อนหมดเวลา, ตัวคูณค่าปรับ (ยังไม่เคยบันทึก = ค่าจาก env) |
| POST | `/fines/quote` | SLOT_INSPECT | คำนวณค่าปรับจอดเกินเวลา ณ ตอนนี้: รอบที่เกิน (รอบละ 4 ชม. ปัดขึ้น) × ราคาต่อช่องต่อรอบของการจอง × ตัวคูณ — `POST /fines` คำนวณซ้ำเอง ไม่รับยอดจาก client |
| GET | `/users/employees` | SETTINGS_MANAGE | พนักงานพร้อมสิทธิ์ที่มีและสิทธิ์ที่ฝ่ายถือได้ |
| PUT | `/users/:id/permissions` | SETTINGS_MANAGE | กำหนดสิทธิ์รายบุคคล (ถอนสิทธิ์ตั้งค่าของตัวเองไม่ได้) |
| GET | `/yard/live` | login | สถานะ ณ เวลานี้ รวมช่องที่หมดเวลา |
| POST | `/yard/inspections` | ตรวจสอบช่องจอด | บันทึกผลตรวจ: รถออกแล้ว / ยังจอดอยู่ |
| DELETE | `/yard/inspections/:id` | SLOT_INSPECT | เลิกทำ "รถออกแล้ว" — ผู้ตรวจคนเดิม ภายใน 10 นาที (`POST /yard/inspections` คืน `id`) |
| GET | `/yard/layout` | เปิด-ปิด / แก้ผัง | ลานจอดและช่องจอดทั้งหมด |
| POST, DELETE | `/yard/lots`, `/yard/slots` | แก้ผัง | เพิ่ม / ลบ ลานจอดและช่องจอด |
| PATCH | `/yard/lots/:id`, `/yard/slots/:id/status` | เปิด-ปิด | เปิด / ปิด / สงวนสิทธิ์ |
| GET, POST | `/rates` | กำหนดราคา | ประวัติและการกำหนดอัตราตามหนังสืออนุญาต |
| GET | `/payments/:id` | login | สถานะการชำระและ QR (เจ้าของรายการหรือพนักงาน) |
| POST | `/payments/:id/mock-pay` | login | จำลองว่าชำระสำเร็จ — ใช้ได้เฉพาะ `PAYMENT_GATEWAY_MODE=mock` |
| GET | `/bookings/schedule` | login | ตารางการจองของตนเอง: ที่กำลังใช้อยู่และที่ยังมาไม่ถึง พร้อมรอบถัดไปที่จองต่อได้ |
| GET | `/reports/bookings` | รายงาน | รายการจองในช่วงวันเวลาที่ทำรายการ กรองตาม `type` `plan` `source` `state` `q` (สูงสุด 1,000 รายการ) |
| GET | `/reports/dashboard` | รายงาน | ภาพรวมการจองตามสถานะการชำระ ประเภทผู้ใช้ ช่องทาง ลานจอด (จำนวนและยอดชำระ) และรายวัน + `previous` ยอดของช่วงก่อนหน้าที่ยาวเท่ากัน; กรองเพิ่มด้วย `lot`, `type`, `customerType` |
| GET, POST | `/fines` | login / ตรวจสอบช่องจอด | รายการค่าปรับ / บันทึกค่าปรับ |
| POST | `/fines/:id/payment` | login | รายการชำระที่ใช้ได้ของค่าปรับ (ออก QR ใหม่ถ้าของเดิมหมดอายุ) |
| GET | `/notifications`, POST `/notifications/read-all` | login | การแจ้งเตือนในเว็บ |
| GET | `/reports/payments` | รายงาน | สรุปยอดชำระตามช่วงวันและเวลา |

"เปิด" = ไม่ต้อง login (ติด `@Public()`), "login" = ผู้ใช้ทุกคนที่ login, นอกนั้นคือสิทธิ์รายบุคคลตามข้อ 2 ของ requirement ผู้ขอใช้บริการเข้าถึงได้เฉพาะข้อมูลของตนเอง รายการของคนอื่นตอบ 404

ทุก endpoint ตอบรูปแบบเดียวกัน:

```jsonc
{ "data": { ... } }                                                        // สำเร็จ
{ "error": { "code": "BOOKING_INVALID", "message": "...", "details": [], "requestId": "..." } } // ผิดพลาด
```

ทุก response มี header `X-Request-Id` (ใช้ค่าที่ client ส่งมา หรือสร้างให้ใหม่) ค่าเดียวกันอยู่ใน `error.requestId` และใน log ใช้ตามหา log ของ request ที่ผู้ใช้แจ้งปัญหา

| HTTP | code | เมื่อไร |
|---|---|---|
| 400 | `VALIDATION_FAILED` | รูปแบบ request ผิด (`details` คือรายการที่ผิด) |
| 422 | `BOOKING_INVALID` | ผิดกติกาการจอง (`details` คือรหัสกติกา เช่น `START_TOO_FAR_AHEAD`, `SKIP_DATE_INVALID` = วันที่ข้ามไม่อยู่ระหว่างวันแรกกับวันสุดท้าย) |
| 422 | `PAYMENT_PLAN_NOT_ALLOWED` | เลือกชำระวันต่อวันกับการจองระยะสั้น |
| 401 | `AUTH_REQUIRED` | ยังไม่ login หรือ session หมดอายุ |
| 401 | `AUTH_INVALID_CREDENTIALS` | login ไม่ผ่าน (ข้อความเดียวกันทุกกรณี) |
| 403 | `PERMISSION_DENIED` | ไม่มีสิทธิ์ทำรายการนี้ |
| 422 | `REGISTER_NOT_IN_CRM` | ไม่พบข้อมูลผู้ขอใช้บริการใน CRM |
| 409 | `REGISTER_ALREADY_EXISTS` | ลงทะเบียนไปแล้ว |
| 409 | `BOOKING_SLOT_TAKEN` | ช่องถูกจองตัดหน้า (ชน unique ของ `slot_occupancies`) |
| 422 | `BOOKING_SLOT_NOT_BOOKABLE` | ช่องปิด สงวนสิทธิ์ หรือไม่มีอยู่ |
| 422 | `BOOKING_UNPAID_FINE` | ผู้จองมีค่าปรับค้างชำระ จองไม่ได้จนกว่าจะชำระ |
| 409 | `FINE_ALREADY_PAID` | ค่าปรับนี้ชำระแล้ว ออกรายการชำระใหม่ไม่ได้ |
| 422 | `BOOKING_CUSTOMER_INVALID` | จองแทน: ไม่พบผู้ขอใช้บริการ |
| 422 | `BOOKING_DAYS_NOT_PAYABLE` | ชำระรายวันไม่ได้ (ชำระแล้ว หรือการจองไม่ได้ใช้งานอยู่) |
| 409 | `PAYMENT_EXPIRED` | รายการชำระหมดอายุ |
| 409 | `SLOT_HAS_BOOKINGS` | ปิด/ลบช่องที่ยังมีการจองค้างอยู่ |
| 422 | `INSPECTION_UNDO_EXPIRED` / `INSPECTION_UNDO_NOT_ALLOWED` | เลยเวลาเลิกทำ หรือไม่ใช่ผู้ตรวจที่บันทึก |
| 422 | `ROUND_HOURS_INVALID` / `ROUND_FIRST_HOUR_INVALID` / `ROUND_EFFECTIVE_TOO_SOON` | ตารางรอบไม่ถูกต้อง หรือวันมีผลอยู่ในช่วงที่จองได้แล้ว |
| 409 | `ROUND_CONFIG_HAS_BOOKINGS` | มีการจองใช้วันนั้นแล้ว (`details[0]` = วันแรกที่ตั้งได้) |
| 422 | `FINE_NOT_OVERTIME` | ช่องยังไม่เกินเวลาที่จอง จึงปรับไม่ได้ |
| 422 | `FINE_BOOKING_INVALID` | ค่าปรับ: ไม่พบการจอง หรือการจองไม่ได้ใช้ช่องนี้ |
| 422 | `IMPORT_HEADER_INVALID` / `IMPORT_TOO_MANY_ROWS` | ไฟล์นำเข้าไม่ใช่แบบฟอร์ม หรือเกิน 200 แถว |
| 422 | `BOOKING_IMPORT_INVALID` | นำเข้าไม่ได้เพราะมีแถวที่ไม่ผ่าน (ดูผลจาก preview) |
| 422 | `PERMISSION_NOT_ALLOWED` / `PERMISSION_SELF_LOCKOUT` | ให้สิทธิ์นอกฝ่าย หรือถอนสิทธิ์ตั้งค่าของตัวเอง |
| 422 | `REPORT_RANGE_INVALID` | ช่วงเวลารายงานไม่ถูกต้อง (ไม่เกิน 366 วัน) |
| 404 | `NOT_FOUND` | ไม่มี endpoint นี้ |
| 404 | `RECORD_NOT_FOUND` | ไม่พบข้อมูลที่จะแก้ไขหรือลบ |
| 409 | `DUPLICATE_ENTRY` | ข้อมูลซ้ำกับที่มีอยู่ (ชน unique ในฐานข้อมูล) |
| 409 | `RELATED_RECORD_CONFLICT` | ข้อมูลยังถูกอ้างถึงจากที่อื่น |
| 429 | `TOO_MANY_REQUESTS` | เรียกถี่เกิน `RATE_LIMIT_MAX` ครั้งต่อ `RATE_LIMIT_WINDOW_MS` |
| 500 | `INTERNAL_ERROR` | ข้อผิดพลาดที่ไม่คาดคิด (รายละเอียดอยู่ใน log) |
| 503 | `NOT_READY` | `/ready` เท่านั้น: ฐานข้อมูลยังเชื่อมต่อไม่ได้ |

## ความปลอดภัยและการทำงานใน production

ตั้งค่าทั้งหมดอยู่ที่ `src/app.setup.ts` และ `src/app.module.ts`

| เรื่อง | ทำอย่างไร |
|---|---|
| Security header | `helmet`: nosniff, HSTS, CSP, กัน clickjacking, ซ่อน `X-Powered-By` |
| Rate limit | ต่อ IP ทุก endpoint ยกเว้น `/health` และ `/ready` ตัวนับอยู่ในหน่วยความจำของ process ถ้ารันหลาย instance ต้องย้ายไป storage กลาง |
| IP จริงของ client | ตั้ง `TRUST_PROXY_HOPS` ให้เท่ากับจำนวน reverse proxy หน้าแอป |
| CORS | เฉพาะ origin ใน `WEB_ORIGIN` ไม่รับ `*` |
| Log | JSON 1 บรรทัดต่อ request ออก stdout (method, url, status, เวลา, IP, request id) ไม่ log header และ body |
| Error | error ที่ไม่คาดคิดตอบ `INTERNAL_ERROR` รายละเอียดอยู่ใน log เท่านั้น |
| ปิดแอป | รับ SIGTERM / SIGINT แล้วรอ request เดิมจบและปิดการเชื่อมต่อฐานข้อมูล |

## โครงสร้างโปรเจค

```
prisma/schema.prisma          โครงสร้างฐานข้อมูลทั้งระบบ
src/
  main.ts                     เริ่มแอป + Swagger
  app.setup.ts                ตั้งค่ากลาง: prefix, CORS, validation, รูปแบบ response
  app.module.ts
  config/env.ts               ค่าจาก environment ทั้งหมด
  common/                     ของใช้ร่วม: ApiException, filter, interceptor, http-logger, service-date
  prisma/                     PrismaService
  seed.ts                     ข้อมูลตั้งต้นสำหรับเครื่องพัฒนา
  modules/
    auth/                     login, ลงทะเบียน, session cookie, guard ตรวจสิทธิ์ทุก endpoint
    crm/                      ตัวเชื่อม CRM (ตอนนี้เป็นตัวจำลอง)
    yard/                     ผังลานจอด สถานะช่อง ผลตรวจหน้างาน
    pricing/                  อัตราค่าบริการตามหนังสืออนุญาต
    booking/                  รอบการจอง คำนวณยอด สร้างการจอง ชำระรายวัน นำเข้าการจองลูกค้าประจำ (CSV)
    payment/                  รายการชำระ ตัวเชื่อม Payment Gateway (ตัวจำลอง) ใบเสร็จ ตั๋ว
    fine/                     ค่าปรับ
    notification/             การแจ้งเตือนในเว็บ
    report/                   รายงานสรุปยอดชำระ
    jobs/                     งานตามเวลา
    rounds/                   ตารางรอบแบบมีผลตั้งแต่วันที่ (ค่าตั้งต้น 07:00 รอบละ 4 ชม.)
    settings/                 ค่าตั้งค่าระบบที่ฝ่าย IT ปรับได้ (ทับค่าจาก env)
    users/                    สิทธิ์รายบุคคลของพนักงาน
    audit/                    บันทึกการกระทำสำคัญ
    health/
test/app.e2e-spec.ts          ทดสอบ API ผ่าน HTTP
.claude/skills/ycs-backend-standards/   มาตรฐานโค้ดของโปรเจค
```

แต่ละโมดูลแบ่ง 3 ชั้น: **controller** รับ-ส่งข้อมูล → **service** ประกอบขั้นตอนและคุยกับฐานข้อมูล → **domain** กติกาจาก requirement เป็น function ธรรมดาที่ทดสอบได้โดยไม่ต้องเปิดแอป

## ระบบภายนอกและงานตามเวลา

| ส่วน | ตอนนี้ | เมื่อได้ spec จริง |
|---|---|---|
| CRM | `MockCrmClient`: พบข้อมูลของทุกเบอร์ ยกเว้นเบอร์ที่ลงท้าย `0000` | เพิ่ม class ที่สืบจาก `CrmClient` แล้วสลับใน `CrmModule` |
| Payment Gateway | `MockPaymentGateway`: QR เป็นข้อความจำลอง ยืนยันการชำระด้วย `POST /payments/:id/mock-pay` | เพิ่ม class ที่สืบจาก `PaymentGateway` และ endpoint รับ webhook ที่เรียก `PaymentService.settle()` |
| แจ้งเตือน | ในเว็บอย่างเดียว (`notifications`) | เพิ่มช่องทางภายนอก (SMS / LINE) ใน `JobsService` |

งานตามเวลาอยู่ที่ `modules/jobs` รันทุกนาทีใน process เดียวกับ API: ทำ QR หมดอายุและปล่อยช่อง, ยกเลิกการจองที่ไม่ชำระรายวันภายในเที่ยงคืน, ปิดการจองที่ใช้บริการครบ, แจ้งเตือนก่อนหมดเวลา 15 นาทีและแจ้งผู้ตรวจสอบเมื่อหมดเวลา (ไม่แจ้งถ้าผู้จองคนเดิมจองทุกช่องไว้ในรอบถัดไปทันที), เตือนผู้จองแบบวันต่อวันเมื่อเหลือ 30 นาทีก่อนครบกำหนดชำระ เมื่อรันหลาย instance ให้ตั้ง `RUN_JOBS=true` ไว้ตัวเดียว

## การตีความที่ต้องยืนยันกับผู้ใช้งาน

โค้ดเลือกทางใดทางหนึ่งไว้แล้วเพื่อให้ระบบทำงานได้ และมี comment `[ถาม ข้อ N]` กำกับ:

- **login ผู้ขอใช้บริการ**: เบอร์โทรอย่างเดียวตามเอกสาร ยังไม่มี OTP ใครรู้เบอร์ก็เข้าได้
- **รหัสผ่านพนักงาน**: เก็บใน YCS เอง (scrypt) ยังไม่ต่อ AD / HR
- **ชำระวันต่อวันที่เริ่มวันนี้**: วันที่กำหนดชำระผ่านไปแล้วตอนจอง ถูกรวมเข้ายอดชำระทันที
- **ราคา**: ระดับทั้งระบบ และใช้อัตรา ณ วันบริการแรกตลอดทั้งการจอง
- **หมดเวลา**: นับจากเวลาที่จอง ไม่มี check-in / check-out ช่องพ้นสถานะหมดเวลาเมื่อผู้ตรวจสอบบันทึกว่ารถออก หรือครบ 24 ชั่วโมง
- **ค่าปรับ**: ผู้ตรวจสอบกรอกเหตุผลและยอดเงินเอง ไม่มีอัตราตายตัว

## สถานะปัจจุบัน

ทำแล้ว: login 3 กลุ่ม + ลงทะเบียน + สิทธิ์รายบุคคลทุก endpoint, ผังลานจอดและสถานะช่อง, ราคา, การจอง (กันจองซ้อนที่ฐานข้อมูล, จองแทน, ชำระวันต่อวัน), การชำระเงินผ่านตัวจำลอง + ตั๋ว + ใบเสร็จ, ตรวจสอบช่องจอดและค่าปรับ, แจ้งเตือนในเว็บ, รายงาน, งานตามเวลา, audit log ของการกระทำสำคัญ

ยังไม่ได้ทำ: เชื่อม CRM และ Payment Gateway จริง (รวม webhook), OTP, นำเข้าการจองลูกค้าประจำ, จัดการผู้ใช้พนักงานและให้/ถอนสิทธิ์ผ่าน API, ตั้งค่าระบบผ่าน API, หน้าค้นหา audit log, export รายงาน, อัปเดตผังแบบ push (ตอนนี้หน้าเว็บโหลดซ้ำเป็นระยะ), worker แยก process, e2e test กับฐานข้อมูลจริง (ตอนนี้ทดสอบ flow ด้วยการยิง API บนเครื่องพัฒนา)
