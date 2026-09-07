import { createInsertSchema } from "drizzle-zod";
import { numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const paymentsTable = pgTable("payments", {
  id: text("id").primaryKey(),
  creditId: text("credit_id").notNull(),
  customerId: text("customer_id").notNull(),
  method: text("method").notNull(),
  amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }).notNull(),
  amountBs: numeric("amount_bs", { precision: 16, scale: 2 }),
  exchangeRate: numeric("exchange_rate", { precision: 12, scale: 4 }),
  note: text("note"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable);
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;