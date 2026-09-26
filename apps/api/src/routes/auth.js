import { Router } from "express";
import { ensureDemoUser } from "../db/repositories.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const email = req.body?.email || "reader@example.com";
  const user = ensureDemoUser(email);
  res.json({
    token: "local-demo-token",
    user: { id: user.id, email: user.email, name: user.name }
  });
});
