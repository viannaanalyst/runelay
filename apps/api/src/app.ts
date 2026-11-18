import { serveStatic } from "@hono/bun";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { env } from "@/config/env";
import { activityRoutes, onboardingRoutes, toolsRoutes } from "@/modules/activity/routes/activity.routes";
import { apiKeysRoutes } from "@/modules/api-keys/routes/api-keys.routes";
import { authRoutes } from "@/modules/auth/routes/auth.routes";
import { catalogRoutes } from "@/modules/catalog/routes/catalog.routes";
import { cliRoutes } from "@/modules/cli/routes/cli.routes";
import { contextRoutes } from "@/modules/context/routes/context.routes";
import { gatewayRoutes } from "@/modules/gateway/routes/gateway.routes";
import { googleFilesRoutes } from "@/modules/google/routes/google-files.routes";
import { memoriesRoutes } from "@/modules/memories/routes/memories.routes";
import { oauthRoutes } from "@/modules/oauth/routes/oauth.routes";
import { meRoutes, organizationsRoutes } from "@/modules/organizations/routes/organizations.routes";
import { skillsRoutes } from "@/modules/skills/routes/skills.routes";
import { sourcesRoutes } from "@/modules/sources/routes/sources.routes";
import { systemRoutes } from "@/modules/system/routes/system.routes";
import { respondError } from "@/shared/http";

const v1 = new Hono()
  .route("/", authRoutes)
  .route("/me", meRoutes)
  .route("/organizations", organizationsRoutes)
  .route("/sources", sourcesRoutes)
  .route("/catalog", catalogRoutes)
  .route("/api-keys", apiKeysRoutes)
  .route("/cli", cliRoutes)
  .route("/oauth", oauthRoutes)
  .route("/google", googleFilesRoutes)
  .route("/memories", memoriesRoutes)
  .route("/skills", skillsRoutes)
  .route("/context", contextRoutes)
  .route("/activity", activityRoutes)
  .route("/onboarding", onboardingRoutes)
  .route("/tools", toolsRoutes)
  .route("/system", systemRoutes)
  .route("/mcp", gatewayRoutes);

export const app = new Hono()
  .use(logger())
  .get("/health", (c) => c.text("ok"))
  .route("/v1", v1)
  .all("/v1/*", (c) => respondError(c, "NOT_FOUND"))
  .use("*", serveStatic({ root: env.WEB_DIST }))
  .get("*", serveStatic({ root: env.WEB_DIST, path: "index.html" }))
  .notFound((c) => respondError(c, "NOT_FOUND"))
  .onError((error, c) => respondError(c, "INTERNAL", error.message));

export type AppType = typeof app;
