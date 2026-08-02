import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // All test files share one live Postgres database (Encore's local dev DB) with no
    // per-file isolation. Running files in parallel worker processes lets multiple
    // workers race into platform/seed.ts's ensureSeeded() at once (each worker has its
    // own copy of the module-scoped `seeded` promise cache), causing duplicate-key
    // violations on companies_pkey. Disable file-level parallelism so files run
    // sequentially in a single process/worker instead.
    fileParallelism: false,
    // The first test to call ensureSeeded() pays the full cost of seeding
    // 1000 companies plus related rows; on Encore Cloud's build container
    // this exceeds Vitest's 5000ms default.
    testTimeout: 30000,
  },
});
