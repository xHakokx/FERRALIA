import { numeric, pgTable, timestamp, integer, text } from "drizzle-orm/pg-core";

export const exchangeRatesTable = pgTable("exchange_rates", {
  id: integer("id").primaryKey().default(1),
  value: numeric("value", { precision: 12, scale: 4 }).notNull(),
  source: text("source").notNull().default("manual"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityTable = pgTable("activity", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});