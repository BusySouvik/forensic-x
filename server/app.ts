import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { apiRouter } from "./routes";

type CreateAppOptions = {
  staticPath?: string;
};

export function createApp(options: CreateAppOptions = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN || true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/api", apiRouter);

  if (options.staticPath) {
    app.use(express.static(options.staticPath));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api")) {
        res.status(404).json({ error: "API route not found" });
        return;
      }
      res.sendFile(path.join(options.staticPath!, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
