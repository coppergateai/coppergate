import { closeDb, createDb, updateMaintainerPolicy } from "../src/index.ts";

const CG = "2c894510-810e-46cc-8ff0-652f63870639";
const PROJECT = "2ea4afe3-4521-4cec-a062-a42c686e1bb0";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}
const db = createDb(url, { max: 1 });
try {
  const { policy } = await updateMaintainerPolicy(db, {
    workspaceId: CG,
    projectId: PROJECT,
    actor: "script:design-scout-auto-import",
    patch: { designScoutAutoImportMax: 1 },
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        designScout: policy.designScout,
        designScoutAutoImportMax: policy.designScoutAutoImportMax,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb(db);
}
