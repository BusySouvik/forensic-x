import { Router } from "express";
import { authorizationsRouter } from "./authorizations";
import { authRouter } from "./auth";
import { devicesRouter } from "./devices";
import { healthRouter } from "./health";
import { investigationsRouter } from "./investigations";
import { storageRouter } from "./storage";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(investigationsRouter);
apiRouter.use(devicesRouter);
apiRouter.use(authorizationsRouter);
apiRouter.use(storageRouter);

apiRouter.use((_req, res) => {
  res.status(404).json({ error: "API route not found" });
});
