import { describe, expect, it } from "vitest";
import { getFinancialStats } from "./accounts";
import type { Env } from "./types";

type TestEntry = {
  user_id: string;
  entry_type: "income" | "expense";
  date: string;
  amount_cents: number;
  currency: string;
  status: string;
};

describe("accounts stats", () => {
  it("keeps monthly totals separated by currency", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const env = {
      DB: new AccountsStatsDb([
        entry({ date: today, amount_cents: 500, currency: "USD" }),
        entry({ date: today, amount_cents: 500, currency: "EUR" }),
        entry({
          date: today,
          amount_cents: 500,
          currency: "EUR",
          status: "cancelled",
        }),
      ]),
    } as unknown as Env;

    const result = await getFinancialStats(env, "owner", "expense");

    expect(result.stats.thisMonthCents).toBe(1000);
    expect(result.stats.thisMonthTotals).toEqual([
      { currency: "EUR", amountCents: 500 },
      { currency: "USD", amountCents: 500 },
    ]);
    expect(result.stats.defaultCurrency).toBe("USD");
  });
});

function entry(overrides: Partial<TestEntry>): TestEntry {
  return {
    user_id: "owner",
    entry_type: "expense",
    date: "2026-06-01",
    amount_cents: 100,
    currency: "USD",
    status: "paid",
    ...overrides,
  };
}

class AccountsStatsDb {
  constructor(private readonly entries: TestEntry[]) {}

  prepare(sql: string) {
    return new AccountsStatsStatement(sql, this.entries);
  }
}

class AccountsStatsStatement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly entries: TestEntry[],
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async all<T>() {
    if (!this.sql.includes("GROUP BY UPPER(currency)")) return { results: [] as T[] };
    const totals = new Map<string, number>();
    for (const entry of this.filteredEntries()) {
      const currency = entry.currency.toUpperCase();
      totals.set(currency, (totals.get(currency) || 0) + entry.amount_cents);
    }
    return {
      results: [...totals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, total]) => ({ currency, total })) as T[],
    };
  }

  async first<T>() {
    if (this.sql.includes("COUNT(*) AS count")) {
      const [userId, entryType] = this.values;
      return {
        count: this.entries.filter(
          (entry) => entry.user_id === userId && entry.entry_type === entryType,
        ).length,
      } as T;
    }
    return null as T | null;
  }

  private filteredEntries() {
    const [userId, entryType, start, end] = this.values as string[];
    return this.entries.filter(
      (entry) =>
        entry.user_id === userId &&
        entry.entry_type === entryType &&
        entry.date >= start &&
        entry.date < end &&
        entry.status !== "cancelled",
    );
  }
}
