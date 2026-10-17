import { connection } from "next/server";
import { dateFormat } from "@/lib/labels";
import { getLastSync } from "@/lib/queries";

export async function LastSynced() {
  await connection();
  const at = await getLastSync();
  if (!at) return null;
  return <p>Data last updated {dateFormat.format(at)}.</p>;
}
