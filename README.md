# DB_From_Respond_CRM

Apps Script: ดึงข้อมูลจาก raw-respond (DB01) → Filter-raw-respond (DB02)

## โหมดการทำงาน (เมนู 🔄 Respond CRM)
1. โหมด 1 — ดึงข้อมูลทั้งหมดจาก DB01 จนถึงปัจจุบัน (เขียนทับ)
2. โหมด 2 (Manual) — ดึงเฉพาะที่ใหม่กว่าล่าสุดใน DB02 แล้ว merge แบบไม่ซ้ำ
3. โหมด 3 (Trigger) — รันอัตโนมัติทุกวัน 18:00 (Asia/Bangkok)
