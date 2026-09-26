import { ensureDemoUser } from "../db/repositories.js";

export function attachUser(req, _res, next) {
  req.user = ensureDemoUser();
  next();
}
