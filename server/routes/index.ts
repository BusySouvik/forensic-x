import { Router } from "express";
import { acquisitionsRouter } from "./acquisitions";
import { authorizationsRouter } from "./authorizations";
import { authRouter } from "./auth";
import { devicesRouter } from "./devices";
import { healthRouter } from "./health";
import { investigationsRouter } from "./investigations";
import { recoveryJobsRouter } from "./recoveryJobs";
import { recoveryCertificatesRouter } from "./recoveryCertificates";
import { analysisRouter } from "./analysis";
import { storageRouter } from "./storage";
import { workingCopiesRouter } from "./workingCopies";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(investigationsRouter);
apiRouter.use(devicesRouter);
apiRouter.use(authorizationsRouter);
apiRouter.use(acquisitionsRouter);
apiRouter.use(workingCopiesRouter);
apiRouter.use(recoveryJobsRouter);
apiRouter.use(recoveryCertificatesRouter);
apiRouter.use(analysisRouter);
apiRouter.use(storageRouter);

apiRouter.use((_req, res) => {
  res.status(404).json({ error: "API route not found" });
});
