import {
  closeDb,
  createDb,
  fetchArchitectureBacklogMarkdown,
  runVisionReplan,
} from "../src/index.ts";
import {
  createAppJwt,
  createInstallationAccessToken,
} from "../../github/src/index.ts";

const CG = "2c894510-810e-46cc-8ff0-652f63870639";
const PROJECT = "f86212ec-24b9-44b7-955d-cda19d833a14";
const actor = "script:dogfood-acpp-force-replan";
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
  const result = await runVisionReplan(db, {
    workspaceId: CG,
    projectId: PROJECT,
    actor,
    autoQueue: true,
    maxAutoQueue: 1,
    roadmapMarkdown: md,
    architectureToken: minted.token,
  });
  console.log(JSON.stringify({ ok: true, bytes: md.length, ...result }, null, 2));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
