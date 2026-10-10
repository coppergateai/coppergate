import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDb>;

export function createDb(url: string, options?: { max?: number }) {
  const client = postgres(url, { max: options?.max ?? 10 });
  const db = drizzle(client, { schema });
  return Object.assign(db, { $client: client as Sql });
}

export async function closeDb(db: Database): Promise<void> {
  await db.$client.end({ timeout: 5 });
}

export async function checkDb(url: string): Promise<boolean> {
  const client = postgres(url, { max: 1 });
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 5 });
  }
}

export { schema };
