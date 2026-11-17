import type { Role } from "@lofticore/shared";

declare global {
  namespace Express {
    interface Request {
      // set by the authenticate middleware
      user?: { id: string; role: Role; sessionId: string };
    }
  }
}

export {};
