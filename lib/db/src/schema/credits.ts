import { createInsertSchema } from "drizzle-zod";
import { date, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const creditsTable = pgTable("credits", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  productName: text("product_name").notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  downPayment: numeric("down_payment", { precision: 12, scale: 2 }).notNull(),
  financedAmount: numeric("financed_amount", { precision: 12, scale: 2 }).notNull(),
  installmentCount: integer("installment_count").notNull(),
  installmentAmount: numeric("installment_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  remainingAmount: numeric("remaining_amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("active"),
  firstDueDate: date("first_due_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const installmentsTable = pgTable("installments", {
  id: text("id").primaryKey(),
  creditId: text("credit_id").notNull(),
  number: integer("number").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  remainingAmount: numeric("remaining_amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
});

export const insertCreditSchema = createInsertSchema(creditsTable).omit({ createdAt: true });
export type InsertCredit = z.infer<typeof insertCreditSchema>;
export type Credit = typeof creditsTable.$inferSelect;
export type Installment = typeof installmentsTable.$inferSelect;