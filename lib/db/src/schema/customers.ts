import { createInsertSchema } from "drizzle-zod";
import { date, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const customersTable = pgTable("customers", {
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  idNumber: text("id_number").notNull().unique(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  status: text("status").notNull().default("current"),
  balanceFavor: numeric("balance_favor", { precision: 12, scale: 2 }).notNull().default("0"),
  identityDocumentUrl: text("identity_document_url"),
  signatureUrl: text("signature_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  createdAt: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;