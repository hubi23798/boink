/** Move issues back to Backlog (e.g. after linear:complete over-advances Phase B). */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API = "https://api.linear.app/graphql";

function loadKey(): string {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  for (const f of [".env", ".env.local"]) {
    try {
      for (const line of readFileSync(resolve(process.cwd(), f), "utf8").split("\n")) {
        const m = line.match(/^LINEAR_API_KEY=(.+)/);
        if (m) return m[1]!.trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      /* skip */
    }
  }
  throw new Error("Missing LINEAR_API_KEY");
}

async function gql(key: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data ?? {};
}

async function main() {
  const identifiers = process.argv.slice(2);
  if (!identifiers.length) {
    console.error("Usage: pnpm linear:backlog TRF-84 TRF-85");
    process.exit(1);
  }

  const apiKey = loadKey();
  const boot = await gql(apiKey, `{ teams { nodes { id key states { nodes { id name type } } } } }`);
  const team = (boot.teams as { nodes: { id: string; key: string; states: { nodes: { id: string; name: string }[] } }[] }).nodes.find(
    (t) => t.key === "TRF",
  )!;
  const backlogId = team.states.nodes.find((s) => s.name === "Backlog")!.id;

  for (const id of identifiers) {
    const num = id.split("-")[1];
    const data = await gql(
      apiKey,
      `query($term: String!, $teamId: ID!) {
        searchIssues(term: $term, first: 5, filter: { team: { id: { eq: $teamId } } }) {
          nodes { id identifier title state { name } }
        }
      }`,
      { term: id, teamId: team.id },
    );
    const row = (data.searchIssues as { nodes: { id: string; identifier: string; title: string; state: { name: string } }[] }).nodes.find(
      (n) => n.identifier === id || n.identifier === `TRF-${num}`,
    );
    if (!row) {
      console.warn(`Not found: ${id}`);
      continue;
    }
    await gql(apiKey, `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`, {
      id: row.id,
      input: { stateId: backlogId },
    });
    console.log(`Backlog: ${row.identifier} — ${row.title.slice(0, 60)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
