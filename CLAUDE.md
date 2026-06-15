# DB_From_Respond_CRM — Project Context

## โครงสร้าง Spreadsheet

| ชีต | ชื่อ | หน้าที่ |
|-----|------|---------|
| DB01 | `raw-respond` | Lead ทั้งหมดจาก Respond CRM ตาม timeline ไม่มีการกรอง |
| DB02 | `Filter-raw-respond` | ผลลัพธ์หลังกรอง — 1 row ต่อ respond_id ต่อวัน + Ads data |

## Logic หลักของ Code.gs

### Dedup Key
- Key = `respond_id + วันที่ (yyyy-MM-dd)`
- แต่ละ respond_id จะเก็บ **row ที่ Task_ID ใหม่ที่สุดของแต่ละวัน** (ล่าสุดของวันนั้น)
- เรียงผลลัพธ์จากเก่า → ใหม่ ตาม Task_ID

### Ads Matching
- ดึงข้อมูล Ads จาก Spreadsheet แยก: `From-Facebook Ads-Respon.io`
  - Spreadsheet ID: `19yN662iCppjMFJTONgZHpbQH4gOkUtDxUcvqYZyPcKw`
  - Sheet name: `Raw-data`
- Match ด้วย `respond_id`
- เงื่อนไข: **Ad Timestamp เป็นจุดเริ่ม** ลูกค้าต้องติดต่อ CRM **ภายใน 7 วันถัดไป**
  - `0 ≤ (Task_ID − Ad Timestamp) ≤ 7 วัน`
  - ถ้ามีหลาย Ad → เลือกอันที่ใกล้ Task_ID มากที่สุด
  - ถ้าติดต่อก่อน Ad Timestamp → ไม่นับ

### คอลัมน์ใน DB02
- **A–AE**: ข้อมูลจาก raw-respond (DB01)
- **AF–AL**: ข้อมูล Ads ที่ match ได้
  - AF: Source, AG: Sub Source, AH: Ad campaign ID
  - AI: Campaign name, AJ: Ad group ID, AK: Ad ID, AL: Ad name

## โหมดการทำงาน

| โหมด | เรียกใช้ | รายละเอียด |
|------|---------|------------|
| 1 | เมนู 🔄 Respond CRM | ดึงทั้งหมดจาก DB01 → เขียนทับ DB02 ใหม่ทั้งหมด |
| 2 | เมนู 🔄 Respond CRM | ดึงเฉพาะที่ใหม่กว่าล่าสุด แล้วรวม (incremental) |
| 3 | Trigger อัตโนมัติ | ทุกวัน 18:00 Asia/Bangkok (logic เหมือนโหมด 2) |

## Git Branches

| Branch | สถานะ |
|--------|-------|
| `main` | โค้ดเริ่มต้น (ยังไม่มีฟีเจอร์ Ads) |
| `claude/bold-gauss-jjwvmb` | **โค้ดล่าสุด** — มีครบทุกฟีเจอร์ที่พัฒนาใน session นี้ |
| `claude/cool-johnson-sniqv9` | Merged เข้า `claude/bold-gauss-jjwvmb` แล้ว |

> โค้ดที่ใช้งานจริงอยู่ที่ branch `claude/bold-gauss-jjwvmb`

## สิ่งที่ยังค้างอยู่ / ทำต่อได้

- [ ] Merge `claude/bold-gauss-jjwvmb` → `main` (ยังไม่ได้ทำ)
- [ ] ทดสอบรันจริงใน Google Apps Script แล้วตรวจสอบผลลัพธ์ Ads columns AF–AL
