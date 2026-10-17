// Rate every MP in a Hansard debate as for, neutral or against each petition it covers.
// Usage: pnpm debate:stance <debateExtId> <petitionId...>
// Writes nothing to the database; prints a per-member and per-party table.
import {
  type DebatePetition,
  fetchDebate,
  fetchMembers,
  rateMember,
  speechesByMember,
} from "@/lib/debate";
import { createJevClient } from "@/lib/judge";

const [extId, ...petitionIds] = process.argv.slice(2);
if (!extId || petitionIds.length === 0) {
  throw new Error("Usage: pnpm debate:stance <debateExtId> <petitionId...>");
}

const petitions: DebatePetition[] = await Promise.all(
  petitionIds.map(async (id) => {
    const res = await fetch(
      `https://petition.parliament.uk/archived/petitions/${id}.json`,
    );
    if (!res.ok) throw new Error(`${res.status} petition ${id}`);
    const json = await res.json();
    return { id: Number(id), action: json.data.attributes.action as string };
  }),
);

const debate = await fetchDebate(extId);
const date = debate.Overview.Date.slice(0, 10);
const speeches = speechesByMember(debate.Items);
const members = await fetchMembers([...speeches.keys()], date);
const client = createJevClient();

const rows = await Promise.all(
  [...speeches].map(async ([id, texts]) => {
    const member = members.get(id) ?? {
      name: `Member ${id}`,
      party: "Unknown",
    };
    const ratings = await rateMember(
      client,
      debate.Overview.Title,
      member,
      texts,
      petitions,
    );
    return { ...member, speeches: texts.length, ratings };
  }),
);
rows.sort(
  (a, b) => a.party.localeCompare(b.party) || a.name.localeCompare(b.name),
);

console.log(`${debate.Overview.Title}, ${date}\n`);
for (const p of petitions) console.log(`p${p.id}: ${p.action}`);

console.log("\nBy member (stance, confidence)");
for (const r of rows) {
  const cells = r.ratings.map(
    (x) => `p${x.petitionId} ${x.stance} ${x.confidence.toFixed(2)}`,
  );
  console.log(
    `${r.party.padEnd(26)} ${r.name.padEnd(26)} ${String(r.speeches).padStart(3)}  ${cells.join("  ")}`,
  );
}

console.log("\nBy party (members for / neutral / against)");
for (const party of [...new Set(rows.map((r) => r.party))]) {
  const inParty = rows.filter((r) => r.party === party);
  const cells = petitions.map((p) => {
    const n = (s: string) =>
      inParty.filter(
        (r) => r.ratings.find((x) => x.petitionId === p.id)?.stance === s,
      ).length;
    return `p${p.id} ${n("for")}/${n("neutral")}/${n("against")}`;
  });
  console.log(`${party.padEnd(26)} ${cells.join("  ")}`);
}
process.exit(0);
