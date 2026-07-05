/**
 * Mark a TRU-* roadmap issue Done and refresh the top-3 In Progress set.
 * Usage: pnpm linear:complete TRU-A-00
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API = "https://api.linear.app/graphql";

const EXECUTION_ORDER = [
  "TRU-DOC-01", "TRU-A-02", "TRU-A-00", "TRU-A-01", "TRU-A-03", "TRU-A-04", "TRU-A-05",
  "TRU-DOC-02", "TRU-BEU-00", "TRU-GTM-01", "TRU-A-06", "TRU-A-07", "TRU-A-08", "TRU-BEU-01",
  "TRU-BEU-02", "TRU-BEU-03", "TRU-BEU-04", "TRU-BEU-05", "TRU-BEU-06", "TRU-BEU-07",
  "TRU-BEU-08", "TRU-BEU-09", "TRU-BEU-10", "TRU-DOC-03", "TRU-BTR-01", "TRU-BTR-02",
  "TRU-BTR-03", "TRU-BTR-04", "TRU-BTR-05", "TRU-BTR-06", "TRU-BTR-07", "TRU-BTR-08",
  "TRU-BTR-09", "TRU-BTR-10", "TRU-C-01", "TRU-C-02", "TRU-C-07", "TRU-C-03", "TRU-C-04",
  "TRU-C-05", "TRU-C-06", "TRU-C-08", "TRU-C-09", "TRU-C-10", "TRU-GTM-02", "TRU-GTM-03",
  "TRU-GTM-04", "TRU-GTM-05", "TRU-A-09", "TRU-A-10", "TRU-D-01", "TRU-D-02", "TRU-D-03",
  "TRU-D-04", "TRU-D-05", "TRU-US-01",
];

function loadKey(): string {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  for (const f of [".env", ".env.local"]) {
    try {
      for (const line of readFileSync(resolve(process.cwd(), f), "utf8").split("\n")) {
        const m = line.match(/^LINEAR_API_KEY=(.+)/);
        if (m) return m[1]!.trim().replace(/^["']|["']$/g, "");
      }
    } catch { /* skip */ }
  }
  throw new Error("Missing LINEAR_API_KEY");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gql(key: string, query: string, variables?: Record<string, unknown>, attempt = 0) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
  const msg = json.errors?.map((e) => e.message).join("; ") ?? "";
  if (msg.includes("ratelimit") && attempt < 5) {
    await sleep(2000 * (attempt + 1));
    return gql(key, query, variables, attempt + 1);
  }
  if (json.errors?.length) throw new Error(msg);
  return json.data ?? {};
}

async function findIssue(key: string, teamId: string, apiKey: string) {
  const data = await gql(
    apiKey,
    `query($term: String!, $teamId: ID!) {
      searchIssues(term: $term, first: 25, filter: { team: { id: { eq: $teamId } } }) {
        nodes { id identifier title state { type } }
      }
    }`,
    { term: key, teamId },
  );
  const nodes = (
    data.searchIssues as { nodes: { id: string; identifier: string; title: string; state: { type: string } }[] }
  ).nodes.filter(
    (n) => n.title.includes(key) && !n.title.toLowerCase().includes("[duplicate]"),
  );
  if (!nodes.length) return null;
  return [...nodes].sort((a, b) => {
    const na = parseInt(a.identifier.split("-")[1] ?? "0", 10);
    const nb = parseInt(b.identifier.split("-")[1] ?? "0", 10);
    return nb - na;
  })[0]!;
}

async function main() {
  const completeKey = process.argv[2];
  if (!completeKey) {
    console.error("Usage: pnpm linear:complete TRU-A-00");
    process.exit(1);
  }

  const apiKey = loadKey();
  const boot = await gql(
    apiKey,
    `{ viewer { id } teams { nodes { id key states { nodes { id name type } } } } }`,
  );
  const team = (boot.teams as { nodes: { id: string; key: string; states: { nodes: { id: string; name: string; type: string }[] } }[] }).nodes.find(
    (t) => t.key === "TRF",
  ) ?? (boot.teams as { nodes: { id: string }[] }).nodes[0]!;
  const teamId = team.id;
  const states = team.states.nodes;
  const viewerId = (boot.viewer as { id: string }).id;

  const doneId = states.find((s) => s.type === "completed" || s.name === "Done")!.id;
  const progressId = states.find((s) => s.name === "In Progress" || s.type === "started")!.id;
  const backlogId = states.find((s) => s.name === "Backlog" || s.type === "unstarted")!.id;

  const target = await findIssue(completeKey, teamId, apiKey);
  if (!target) throw new Error(`Issue not found: ${completeKey}`);

  await gql(apiKey, `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`, {
    id: target.id,
    input: { stateId: doneId },
  });
  console.log(`Done: ${target.identifier} — ${completeKey}`);

  const nextProgress = new Set<string>();
  for (const k of EXECUTION_ORDER) {
    if (k === completeKey) continue;
    if (nextProgress.size >= 3) break;
    const row = await findIssue(k, teamId, apiKey);
    if (!row || row.state.type === "completed" || row.state.type === "canceled") continue;
    nextProgress.add(k);
  }

  for (const k of EXECUTION_ORDER) {
    if (k === completeKey) continue;
    const row = await findIssue(k, teamId, apiKey);
    if (!row || row.state.type === "completed" || row.state.type === "canceled") continue;
    await gql(apiKey, `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`, {
      id: row.id,
      input: {
        stateId: nextProgress.has(k) ? progressId : backlogId,
        assigneeId: viewerId,
      },
    });
    if (nextProgress.has(k)) console.log(`In Progress: ${row.identifier} ${k}`);
    await sleep(500);
  }

  console.log(`\nIn Progress: ${[...nextProgress].join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
