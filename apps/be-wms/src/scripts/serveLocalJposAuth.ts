import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { selectLocalFirebaseTarget } from "../api/middlewares/localFirebaseTargetMiddleware.js";
import authRoutes from "../api/routes/authRoutes.js";
import posDeviceRoutes from "../api/routes/posDeviceRoutes.js";
import warehouseRoutes from "../api/routes/warehouseRoutes.js";

if (process.env.NODE_ENV !== "development") {
  throw new Error("The JPOS preview auth server requires NODE_ENV=development.");
}

const origin = "http://localhost:3197";
const app = express();
app.disable("x-powered-by");
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.get("Origin") !== origin) {
    res.sendStatus(403);
    return;
  }
  next();
}, cors({ origin, credentials: true }), express.json({ limit: "15mb" }), cookieParser(),
selectLocalFirebaseTarget);
app.use("/api/auth", authRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/pos", posDeviceRoutes);

app.listen(4000, "127.0.0.1", () => {
  console.info(`JPOS preview API ready for ${origin}`);
});
