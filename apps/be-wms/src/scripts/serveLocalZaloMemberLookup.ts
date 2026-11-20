import express from "express";
import { getCurrentFirebaseProjectId } from "../config/firebase.js";
import { runWithLocalFirebaseTarget } from "../config/firebaseTargetContext.js";
import { findZaloHkMember, getZaloHkMemberConfig, normalizePhone } from "../services/zaloHkMemberService.js";
import { customerResult } from "../services/zaloMemberPresentation.js";

const target = "jw-system-f2104";
const hk = getZaloHkMemberConfig();
if (process.env.NODE_ENV !== "development" || !hk ||
    runWithLocalFirebaseTarget(target, getCurrentFirebaseProjectId) !== target) {
  throw new Error("Configure the production Firebase target and HK connection for local lookup.");
}

const app = express();
app.post("/lookup", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.get("Host") !== "127.0.0.1:4011" ||
      req.get("X-Local-Zalo-Lookup") !== "1" || !req.is("application/json")) {
    res.sendStatus(403);
    return;
  }
  next();
}, express.json({ limit: "1kb" }), async (req, res) => {
  const phone = typeof req.body?.phone === "string" && normalizePhone(req.body.phone);
  if (!phone) {
    res.status(400).json({ code: "INVALID_INPUT" });
    return;
  }
  try {
    const member = await runWithLocalFirebaseTarget(target, () => findZaloHkMember(hk, phone));
    res.json(customerResult(phone, member));
  } catch {
    res.status(502).json({ code: "MEMBER_SERVICE_UNAVAILABLE" });
  }
});

app.listen(4011, "127.0.0.1", () => {
  console.info("Local Zalo member lookup ready on 127.0.0.1:4011");
});
