import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

type Source = "body" | "params" | "query";

export function validate(schema: ZodType, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    if (source === "body") {
      req.body = result.data;
    } else if (source === "params") {
      req.params = result.data as Request["params"];
    }
    next();
  };
}
