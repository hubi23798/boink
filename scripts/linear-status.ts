/** List TRF team issue status for Phase A planning. */
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

type Issue = {
  identifier: string;
  title: string;
  state: { name: string; type: string };
  assignee: { displayName: string } | null;
  labels: { nodes: { name: string }[] };
};

async function main() {
  const apiKey = loadKey();
  const boot = await gql(apiKey, `{ teams { nodes { id key } } }`);
  const team = (boot.teams as { nodes: { id: string; key: string }[] }).nodes.find((t) => t.key === "TRF");
  if (!team) throw new Error("TRF team not found");

  const data = await gql(
    apiKey,
    `query($id: String!) {
      team(id: $id) {
        issues(first: 250, orderBy: updatedAt) {
          nodes {
            identifier title
            state { name type }
            assignee { displayName }
            labels { nodes { name } }
          }
        }
      }
    }`,
    { id: team.id },
  );

  const issues = (data.team as { issues: { nodes: Issue[] } }).issues.nodes;

  const isCursor = (i: Issue) =>
    i.labels.nodes.some((l) => l.name === "agent:cursor" || l.name.includes("cursor"));

  console.log("=== agent:cursor (open) ===");
  for (const i of issues.filter((x) => isCursor(x) && x.state.type !== "completed")) {
    console.log(`${i.identifier}\t${i.state.name}\t${i.title.slice(0, 90)}`);
  }

  console.log("\n=== TRU-A-* (open) ===");
  for (const i of issues.filter((x) => x.title.includes("TRU-A-") && x.state.type !== "completed")) {
    const labels = i.labels.nodes.map((l) => l.name).join(",");
    console.log(`${i.identifier}\t${i.state.name}\t[${labels}]\t${i.title.slice(0, 80)}`);
  }

  console.log("\n=== In Progress ===");
  for (const i of issues.filter((x) => x.state.name === "In Progress")) {
    const labels = i.labels.nodes.map((l) => l.name).join(",");
    console.log(`${i.identifier}\t[${labels}]\t${i.title.slice(0, 80)}`);
  }

  const isClaude = (i: Issue) =>
    i.labels.nodes.some((l) => l.name === "agent:claude-code" || l.name.includes("claude"));

  console.log("\n=== agent:claude-code (open) ===");
  for (const i of issues.filter((x) => isClaude(x) && x.state.type !== "completed")) {
    console.log(`${i.identifier}\t${i.state.name}\t${i.title.slice(0, 90)}`);
  }

  console.log("\n=== TRU-A-* Done ===");
  for (const i of issues.filter((x) => x.title.includes("TRU-A-") && x.state.type === "completed")) {
    console.log(`${i.identifier}\t${i.title.slice(0, 90)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
