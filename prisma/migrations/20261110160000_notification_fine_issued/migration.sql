-- แจ้งลูกค้าเมื่อถูกบันทึกค่าปรับ: เพิ่มชนิด FINE_ISSUED ใน CHECK constraint ของ NotificationLog
ALTER TABLE [dbo].[NotificationLog] DROP CONSTRAINT [NotificationLog_Type_check];
ALTER TABLE [dbo].[NotificationLog] ADD CONSTRAINT [NotificationLog_Type_check] CHECK ([Type] IN ('PARKING_EXPIRING', 'PARKING_OVERTIME', 'PAYMENT_DUE', 'BOOKING_CANCELLED', 'FINE_ISSUED'));
