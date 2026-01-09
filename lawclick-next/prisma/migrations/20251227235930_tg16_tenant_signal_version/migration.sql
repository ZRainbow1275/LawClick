-- TG16: TenantSignal 增加单调递增版本号（用于避免 updatedAt 毫秒级精度导致的同毫秒多次更新丢信号）

ALTER TABLE "TenantSignal" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

UPDATE "TenantSignal" SET "version" = 1 WHERE "version" = 0;

