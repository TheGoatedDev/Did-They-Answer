import type { Stance, Verdict } from "@/db/schema";
import { CURRENT_PARLIAMENT } from "./petitions-api";

export const VERDICT_LABELS: Record<Verdict, string> = {
  low: "Low engagement",
  some: "Some engagement",
  thorough: "Thorough engagement",
};

export const STANCE_LABELS: Record<Stance, string> = {
  accepts: "Accepts",
  partially_accepts: "Partly accepts",
  declines: "Declines",
  deflects: "Deflects",
};

export const CRITERION_LABELS = {
  addresses_ask: "Addresses the ask",
  evidence: "Evidence",
  reasoning: "Policy reasoning",
  outcome: "Outcome",
  specificity: "Specificity",
} as const;

export function parliamentLabel(parliament: string) {
  return parliament === CURRENT_PARLIAMENT
    ? "2024–present"
    : parliament.replace("-", "–");
}

export const numberFormat = new Intl.NumberFormat("en-GB");
export const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/London",
});
