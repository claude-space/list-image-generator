// PM2 process config for shellagent.io VM deploys.
//
// Used by `pm2 start ecosystem.config.js` (the deploy-to-vm SKILL).
// Avoids having to pass `--name`, `--cwd`, env vars, etc. on every restart.
//
// PORT and BASE_PATH are intentionally set here, not in the app's runtime
// env, so the VM operator only needs to edit one file when re-provisioning.

module.exports = {
  apps: [
    {
      name: "list-image-generator",
      // Next.js's production server. PORT is read from the env block below.
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      // Restart if RSS exceeds 1 GB — Playwright + sharp can leak under load.
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        // Port 3103 was originally chosen but is taken by another agent
        // (adops-analysis) on this shared VM. 3134 is the first free port
        // above the existing 3100-3133 cluster.
        PORT: "3134",
        // basePath is also baked in at build time (next.config.ts reads
        // BASE_PATH from the env). Set the same value here so runtime
        // logs / fetches that read it agree with the build.
        BASE_PATH: "/agents/list-image-generator",
        NEXT_PUBLIC_BASE_PATH: "/agents/list-image-generator",
      },
    },
  ],
};
