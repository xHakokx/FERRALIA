import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  activityTable,
  customersTable,
  creditsTable,
  exchangeRatesTable,
  installmentsTable,
  paymentsTable,
} from "@workspace/db";
import {
  CreateCreditBody,
  CreateCustomerBody,
  CreatePaymentBody,
  CreatePaymentParams,
  GetContractParams,
  GetCreditParams,
  GetCustomerParams,
  GetCustomerStatementParams,
  GetDashboardSummaryResponse,
  GetExchangeRateResponse,
  GetRecentActivityQueryParams,
  GetRecentActivityResponse,
  GetCustomerResponse,
  GetCustomerStatementResponse,
  GetCreditResponse,
  CreateCustomerResponse,
  CreateCreditResponse,
  CreatePaymentResponse,
  ListCustomersQueryParams,
  ListCustomersResponse,
  GetContractResponse,
  UpdateExchangeRateBody,
  UpdateExchangeRateResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const asNumber = (value: string | number | null | undefined): number =>
  value == null ? 0 : Number(value);

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const addDays = (dateString: string, days: number): string => {
  const value = new Date(`${dateString}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const customerDto = (customer: typeof customersTable.$inferSelect, credits: (typeof creditsTable.$inferSelect)[]) => ({
  id: customer.id,
  fullName: `${customer.firstName} ${customer.lastName}`,
  idNumber: customer.idNumber,
  phone: customer.phone,
  address: customer.address,
  status: customer.status as "current" | "overdue" | "finished",
  activeDebt: credits.reduce((sum, credit) => sum + asNumber(credit.remainingAmount), 0),
  balanceFavor: asNumber(customer.balanceFavor),
  creditsCount: credits.length,
  nextDueDate:
    credits
      .filter((credit) => asNumber(credit.remainingAmount) > 0)
      .sort((a, b) => String(a.firstDueDate).localeCompare(String(b.firstDueDate)))[0]?.firstDueDate ?? null,
});

const creditDto = (credit: typeof creditsTable.$inferSelect) => ({
  id: credit.id,
  customerId: credit.customerId,
  productName: credit.productName,
  totalAmount: asNumber(credit.totalAmount),
  downPayment: asNumber(credit.downPayment),
  financedAmount: asNumber(credit.financedAmount),
  installmentCount: credit.installmentCount,
  installmentAmount: asNumber(credit.installmentAmount),
  paidAmount: asNumber(credit.paidAmount),
  remainingAmount: asNumber(credit.remainingAmount),
  status: credit.status as "active" | "overdue" | "finished",
  nextDueDate: asNumber(credit.remainingAmount) <= 0.005 ? null : credit.firstDueDate,
  createdAt: iso(credit.createdAt),
});

const paymentDto = (payment: typeof paymentsTable.$inferSelect) => ({
  id: payment.id,
  creditId: payment.creditId,
  customerId: payment.customerId,
  method: payment.method as "mobile_payment" | "cash_usd" | "zelle" | "binance",
  amountUsd: asNumber(payment.amountUsd),
  amountBs: payment.amountBs == null ? null : asNumber(payment.amountBs),
  exchangeRate: payment.exchangeRate == null ? null : asNumber(payment.exchangeRate),
  paidAt: iso(payment.paidAt),
  note: payment.note ?? null,
});

router.get("/dashboard-summary", async (_req, res): Promise<void> => {
  const [customers, credits, payments] = await Promise.all([
    db.select().from(customersTable),
    db.select().from(creditsTable),
    db.select().from(paymentsTable),
  ]);
  const now = new Date();
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  const totalToCollect = credits.reduce((sum, credit) => sum + asNumber(credit.remainingAmount), 0);
  const overdueCustomers = customers.filter((customer) => customer.status === "overdue").length;
  const activeCustomers = customers.filter((customer) => customer.status !== "finished").length;
  const collectedThisMonth = payments
    .filter((payment) => payment.paidAt.getUTCMonth() === month && payment.paidAt.getUTCFullYear() === year)
    .reduce((sum, payment) => sum + asNumber(payment.amountUsd), 0);
  const overdueAmount = credits
    .filter((credit) => credit.status === "overdue")
    .reduce((sum, credit) => sum + asNumber(credit.remainingAmount), 0);

  res.json(GetDashboardSummaryResponse.parse({
    totalToCollect,
    collectedThisMonth,
    overdueAmount,
    activeCustomers,
    overdueCustomers,
    dueToday: credits.filter((credit) => credit.firstDueDate === now.toISOString().slice(0, 10)).length,
  }));
});

router.get("/activity", async (req, res): Promise<void> => {
  const params = GetRecentActivityQueryParams.parse(req.query);
  const events = await db.select().from(activityTable).orderBy(desc(activityTable.occurredAt)).limit(params.limit ?? 10);
  res.json(GetRecentActivityResponse.parse(events.map((event) => ({
    ...event,
    amount: event.amount == null ? null : asNumber(event.amount),
    occurredAt: iso(event.occurredAt),
  }))));
});

router.get("/customers", async (req, res): Promise<void> => {
  const params = ListCustomersQueryParams.parse(req.query);
  const customers = await db
    .select()
    .from(customersTable)
    .where(
      params.search
        ? or(ilike(customersTable.firstName, `%${params.search}%`), ilike(customersTable.lastName, `%${params.search}%`), ilike(customersTable.idNumber, `%${params.search}%`))
        : undefined,
    )
    .orderBy(customersTable.lastName);
  const credits = customers.length
    ? await db.select().from(creditsTable).where(inArray(creditsTable.customerId, customers.map((customer) => customer.id)))
    : [];
  const byCustomer = new Map<string, (typeof creditsTable.$inferSelect)[]>();
  for (const credit of credits) byCustomer.set(credit.customerId, [...(byCustomer.get(credit.customerId) ?? []), credit]);
  const result = customers
    .map((customer) => customerDto(customer, byCustomer.get(customer.id) ?? []))
    .filter((customer) => params.status === "all" || customer.status === params.status);
  res.json(ListCustomersResponse.parse(result));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const customer = await db.insert(customersTable).values({
    id: randomUUID(),
    ...parsed.data,
  }).returning();
  const created = customer[0];
  await db.insert(activityTable).values({
    id: randomUUID(),
    type: "customer",
    title: "Nuevo cliente",
    description: `${created.firstName} ${created.lastName} fue agregado al portafolio`,
    amount: null,
  });
  res.status(201).json(CreateCustomerResponse.parse(customerDto(created, [])));
});

router.get("/customers/:customerId", async (req, res): Promise<void> => {
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.customerId));
  if (!customer) {
    res.status(404).json({ error: "Cliente no encontrado" });
    return;
  }
  const [credits, payments] = await Promise.all([
    db.select().from(creditsTable).where(eq(creditsTable.customerId, customer.id)).orderBy(desc(creditsTable.createdAt)),
    db.select().from(paymentsTable).where(eq(paymentsTable.customerId, customer.id)).orderBy(desc(paymentsTable.paidAt)),
  ]);
  res.json(GetCustomerResponse.parse({
    ...customerDto(customer, credits),
    credits: credits.map(creditDto),
    payments: payments.map(paymentDto),
    identityDocumentUrl: customer.identityDocumentUrl,
    signatureUrl: customer.signatureUrl,
  }));
});

router.get("/customers/:customerId/statement", async (req, res): Promise<void> => {
  const params = GetCustomerStatementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, params.data.customerId));
  if (!customer) {
    res.status(404).json({ error: "Cliente no encontrado" });
    return;
  }
  const credits = await db.select().from(creditsTable).where(eq(creditsTable.customerId, customer.id));
  const totalPaid = credits.reduce((sum, credit) => sum + asNumber(credit.paidAmount), 0);
  const totalRemaining = credits.reduce((sum, credit) => sum + asNumber(credit.remainingAmount), 0);
  const customerSummary = customerDto(customer, credits);
  res.json(GetCustomerStatementResponse.parse({
    customer: customerSummary,
    credits: credits.map(creditDto),
    totalPaid,
    totalRemaining,
    shareText: `Estado de cuenta de ${customerSummary.fullName}: pagado $${totalPaid.toFixed(2)} · saldo $${totalRemaining.toFixed(2)}`,
  }));
});

router.post("/credits", async (req, res): Promise<void> => {
  const parsed = CreateCreditBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, parsed.data.customerId));
  if (!customer) {
    res.status(404).json({ error: "Cliente no encontrado" });
    return;
  }
  const financedAmount = Math.max(0, parsed.data.totalAmount - parsed.data.downPayment);
  const installmentAmount = financedAmount / parsed.data.installmentCount;
  const creditId = randomUUID();
  const firstDueDate = parsed.data.firstDueDate.toISOString().slice(0, 10);
  const [credit] = await db.insert(creditsTable).values({
    id: creditId,
    customerId: parsed.data.customerId,
    productName: parsed.data.productName,
    totalAmount: parsed.data.totalAmount.toFixed(2),
    downPayment: parsed.data.downPayment.toFixed(2),
    financedAmount: financedAmount.toFixed(2),
    installmentCount: parsed.data.installmentCount,
    installmentAmount: installmentAmount.toFixed(2),
    paidAmount: parsed.data.downPayment.toFixed(2),
    remainingAmount: financedAmount.toFixed(2),
    status: "active",
    firstDueDate,
  }).returning();
  const installmentRows = Array.from({ length: parsed.data.installmentCount }, (_, index) => ({
    id: randomUUID(),
    creditId,
    number: index + 1,
    dueDate: addDays(firstDueDate, index * 15),
    amount: installmentAmount.toFixed(2),
    paidAmount: "0",
    remainingAmount: installmentAmount.toFixed(2),
    status: "pending",
  }));
  await db.insert(installmentsTable).values(installmentRows);
  await db.insert(activityTable).values({
    id: randomUUID(),
    type: "credit",
    title: "Nuevo crédito",
    description: `${customer.firstName} ${customer.lastName} · ${parsed.data.productName}`,
    amount: parsed.data.totalAmount.toFixed(2),
  });
  res.status(201).json(CreateCreditResponse.parse(creditDto(credit)));
});

router.get("/credits/:creditId", async (req, res): Promise<void> => {
  const params = GetCreditParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [credit] = await db.select().from(creditsTable).where(eq(creditsTable.id, params.data.creditId));
  if (!credit) {
    res.status(404).json({ error: "Crédito no encontrado" });
    return;
  }
  const installments = await db.select().from(installmentsTable).where(eq(installmentsTable.creditId, credit.id)).orderBy(installmentsTable.number);
  res.json(GetCreditResponse.parse({
    ...creditDto(credit),
    installments: installments.map((installment) => ({
      number: installment.number,
      dueDate: installment.dueDate,
      amount: asNumber(installment.amount),
      paidAmount: asNumber(installment.paidAmount),
      remainingAmount: asNumber(installment.remainingAmount),
      status: installment.status as "pending" | "partial" | "paid" | "overdue",
    })),
  }));
});

router.post("/credits/:creditId/payments", async (req, res): Promise<void> => {
  const params = CreatePaymentParams.safeParse(req.params);
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [credit] = await db.select().from(creditsTable).where(eq(creditsTable.id, params.data.creditId));
  if (!credit) {
    res.status(404).json({ error: "Crédito no encontrado" });
    return;
  }
  const [rate] = await db.select().from(exchangeRatesTable).where(eq(exchangeRatesTable.id, 1));
  const exchangeRate = parsed.data.method === "mobile_payment" ? parsed.data.exchangeRate ?? asNumber(rate?.value) : null;
  const amountUsd = parsed.data.method === "mobile_payment"
    ? asNumber(parsed.data.amountBs) / (exchangeRate || 1)
    : asNumber(parsed.data.amountUsd);
  if (amountUsd <= 0) {
    res.status(400).json({ error: "El monto del pago debe ser mayor a cero" });
    return;
  }
  const [payment] = await db.insert(paymentsTable).values({
    id: randomUUID(),
    creditId: credit.id,
    customerId: credit.customerId,
    method: parsed.data.method,
    amountUsd: amountUsd.toFixed(2),
    amountBs: parsed.data.amountBs == null ? null : parsed.data.amountBs.toFixed(2),
    exchangeRate: exchangeRate == null ? null : exchangeRate.toFixed(4),
    note: parsed.data.note ?? null,
  }).returning();
  const newPaid = asNumber(credit.paidAmount) + amountUsd;
  const newRemaining = Math.max(0, asNumber(credit.remainingAmount) - amountUsd);
  await db.update(creditsTable).set({
    paidAmount: newPaid.toFixed(2),
    remainingAmount: newRemaining.toFixed(2),
    status: newRemaining <= 0.005 ? "finished" : credit.status,
  }).where(eq(creditsTable.id, credit.id));
  const installments = await db.select().from(installmentsTable).where(eq(installmentsTable.creditId, credit.id)).orderBy(installmentsTable.number);
  let remainingPayment = amountUsd;
  for (const installment of installments) {
    if (remainingPayment <= 0) break;
    const installmentRemaining = asNumber(installment.remainingAmount);
    const applied = Math.min(remainingPayment, installmentRemaining);
    const installmentLeft = Math.max(0, installmentRemaining - applied);
    await db.update(installmentsTable).set({
      paidAmount: (asNumber(installment.paidAmount) + applied).toFixed(2),
      remainingAmount: installmentLeft.toFixed(2),
      status: installmentLeft <= 0.005 ? "paid" : "partial",
    }).where(eq(installmentsTable.id, installment.id));
    remainingPayment -= applied;
  }
  await db.insert(activityTable).values({
    id: randomUUID(),
    type: "payment",
    title: "Pago registrado",
    description: `${credit.productName} · ${parsed.data.method === "mobile_payment" ? "Pago Móvil" : parsed.data.method}`,
    amount: amountUsd.toFixed(2),
  });
  res.status(201).json(CreatePaymentResponse.parse(paymentDto(payment)));
});

router.get("/settings/rate", async (_req, res): Promise<void> => {
  const [rate] = await db.select().from(exchangeRatesTable).where(eq(exchangeRatesTable.id, 1));
  const result = rate ?? { value: "36.58", source: "manual", updatedAt: new Date() };
  res.json(GetExchangeRateResponse.parse({
    value: asNumber(result.value),
    source: result.source as "bcv" | "manual",
    updatedAt: iso(result.updatedAt),
  }));
});

router.patch("/settings/rate", async (req, res): Promise<void> => {
  const parsed = UpdateExchangeRateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [rate] = await db.insert(exchangeRatesTable).values({
    id: 1,
    value: parsed.data.value.toFixed(4),
    source: "manual",
  }).onConflictDoUpdate({
    target: exchangeRatesTable.id,
    set: { value: parsed.data.value.toFixed(4), source: "manual", updatedAt: new Date() },
  }).returning();
  res.json(UpdateExchangeRateResponse.parse({
    value: asNumber(rate.value),
    source: "manual",
    updatedAt: iso(rate.updatedAt),
  }));
});

router.get("/contracts/:creditId", async (req, res): Promise<void> => {
  const params = GetContractParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [credit] = await db.select().from(creditsTable).where(eq(creditsTable.id, params.data.creditId));
  if (!credit) {
    res.status(404).json({ error: "Contrato no encontrado" });
    return;
  }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, credit.customerId));
  if (!customer) {
    res.status(404).json({ error: "Cliente no encontrado" });
    return;
  }
  res.json(GetContractResponse.parse({
    id: `contract-${credit.id}`,
    creditId: credit.id,
    customerId: customer.id,
    url: `${req.protocol}://${req.get("host")}/contrato/${credit.id}`,
    status: "pending",
    createdAt: iso(credit.createdAt),
  }));
});

export default router;