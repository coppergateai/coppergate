import {
  closeDb,
  createDb,
  fetchArchitectureBacklogMarkdown,
  listInFlightArchitectureIds,
  parseArchitectureOpenTasks,
  pickNextArchitectureTask,
} from "../src/index.ts";
import {
  createAppJwt,
  createInstallationAccessToken,
} from "../../github/src/index.ts";

const CG = "2c894510-810e-46cc-8ff0-652f63870639";
const PROJECT = "f86212ec-24b9-44b7-955d-cda19d833a14";
const db = createDb(process.env.DATABASE_URL!, { max: 1 });
try {
  const jwt = await createAppJwt({
    appId: process.env.GITHUB_APP_ID!,
    slug: process.env.GITHUB_APP_SLUG,
    privateKeyPem: process.env.GITHUB_APP_PRIVATE_KEY!,
  });
  const minted = await createInstallationAccessToken(jwt, 172191459);
  const md = await fetchArchitectureBacklogMarkdown({
    token: minted.token,
    repo: "coppergateai/acpp",
    paths: "docs/OPEN_PROGRAM.md",
  });
  const parsed = parseArchitectureOpenTasks(md);
  const excludeIds = await listInFlightArchitectureIds(db, {
    workspaceId: CG,
    projectId: PROJECT,
    architectureToken: minted.token,
  });
  const next = pickNextArchitectureTask(parsed, { excludeIds });
  console.log(
    JSON.stringify(
      {
        bytes: md.length,
        parsed: parsed.map((p) => p.id),
        excludeIds,
        next: next && { id: next.id, title: next.title.slice(0, 80) },
      },
      null,
      2,
    ),
  );
} finally {
  await closeDb(db);
}
