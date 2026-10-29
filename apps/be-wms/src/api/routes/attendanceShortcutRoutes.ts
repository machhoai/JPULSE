import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import {
  createShortcutPairing,
  exchangeShortcutPairing,
  getShortcutPairingOwner,
  revokeShortcutConnection,
  shortcutConnectionStatus,
  verifyShortcutToken,
} from "../../repositories/attendanceShortcutRepository.js";
import { getEmployeeProfileByUserId } from "../../repositories/employeeProfileRepository.js";
import { assertPersonalAttendanceAction } from "../../services/attendanceAuthorizationPolicy.js";
import {
  renderShortcutResult,
  shortcutCheckInSchema,
  shortcutSecretSchema,
} from "../../services/attendanceShortcutPolicy.js";
import { checkInAttendance } from "../../services/scopedAttendanceService.js";
import { sendSuccess } from "../../utils/responseHelper.js";
import {
  attachAuthorizationForUser,
  requireAuth,
} from "../middlewares/authMiddleware.js";
import {
  requireAuthenticatedRequestUser,
  requireRequestAuthorization,
} from "../middlewares/requestAccessContext.js";

export const attendanceShortcutRoutes: Router = Router();
const router = attendanceShortcutRoutes;

const html = (
  res: Response,
  status: number,
  input: Parameters<typeof renderShortcutResult>[0],
) => res.status(status).type("html").send(renderShortcutResult(input));

router.use((_req, res, next) => {
  res.set({
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  });
  next();
});
router.use(
  rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => {
      if (req.path === "/check-in")
        return html(res, 429, {
          success: false,
          message: "Quá nhiều yêu cầu. Vui lòng thử lại sau một phút.",
        });
      return res.status(429).json({
        success: false,
        messages: { vi: "Quá nhiều yêu cầu. Vui lòng thử lại sau một phút." },
      });
    },
  }),
);

async function assertCheckInPermission(req: Request) {
  const user = requireAuthenticatedRequestUser(req);
  const profile = await getEmployeeProfileByUserId(user.id);
  assertPersonalAttendanceAction(
    requireRequestAuthorization(req),
    "attendance.check_in",
    profile?.workplace_warehouse_id ?? null,
  );
  return user;
}

function errorDetails(error: unknown) {
  if (error instanceof z.ZodError) {
    // Fixed descriptions only: never echo submitted values, credentials or arbitrary keys.
    const fields: Record<string, string> = {
      location: "location phải là một đối tượng JSON chứa tọa độ và thời gian",
      "location.latitude": "location.latitude phải là số từ -90 đến 90",
      "location.longitude": "location.longitude phải là số từ -180 đến 180",
      "location.accuracy_m":
        "location.accuracy_m phải là số lớn hơn 0 và không quá 10000, hoặc bỏ hẳn trường này",
      "location.captured_at":
        "location.captured_at phải là văn bản ngày giờ UTC dạng 2026-10-29T03:30:00Z",
      code: "Mã kết nối không đúng định dạng; hãy tạo kết nối mới trên trang chấm công",
    };
    const details = [
      ...new Set(
        error.issues.map(
          (issue) =>
            fields[issue.path.join(".")] ??
            "Nội dung JSON chứa trường không được hỗ trợ hoặc không đúng cấu trúc",
        ),
      ),
    ].join("; ");
    return {
      status: 400,
      message: `Dữ liệu chấm công không hợp lệ. Chi tiết: ${details}. Vui lòng kiểm tra cấu hình Shortcut.`,
    };
  }
  const known = error as {
    statusCode?: number;
    messages?: { vi?: string };
    data?: { rejected_reason?: string };
  };
  const locationReasons: Record<string, string> = {
    INVALID_IP: "Vui lòng kết nối mạng công ty để chấm công.",
    LOCATION_REQUIRED:
      "Shortcut chưa gửi dữ liệu vị trí GPS. Hãy kết nối mạng công ty đã được cho phép hoặc mở trang chấm công trên web để gửi vị trí. Cấp quyền vị trí trong iOS chưa đủ nếu Shortcut chưa có bước lấy và gửi GPS.",
    GPS_ACCURACY_LOW:
      "Vị trí GPS chưa đủ chính xác. Vui lòng lấy lại vị trí rồi thử lại.",
    GPS_STALE: "Vị trí GPS đã quá cũ. Vui lòng lấy lại vị trí rồi thử lại.",
    OUTSIDE_GEOFENCE: "Bạn đang ở ngoài phạm vi được phép chấm công.",
    REMOTE_ARRANGEMENT_REQUIRED:
      "Chưa có lịch công tác hoặc làm việc tại nhà được duyệt.",
    WORKPLACE_COORDINATE_MISSING:
      "Nơi làm việc chưa được cấu hình tọa độ chấm công.",
  };
  return {
    status:
      known.statusCode && known.statusCode >= 400 && known.statusCode < 500
        ? known.statusCode
        : 500,
    message:
      locationReasons[known.data?.rejected_reason ?? ""] ??
      (known.statusCode && known.statusCode < 500
        ? known.messages?.vi
        : undefined) ??
      "Không thể xử lý chấm công. Vui lòng thử lại sau.",
  };
}

// These two endpoints accept only the integration's own credentials, never browser cookies.
router.post("/exchange", async (req, res) => {
  try {
    const { code } = z
      .object({ code: shortcutSecretSchema })
      .strict()
      .parse(req.body);
    const userId = await getShortcutPairingOwner(code);
    await attachAuthorizationForUser(req, userId);
    await assertCheckInPermission(req);
    const session = await exchangeShortcutPairing(code, userId);
    return sendSuccess(res, session, {
      vi: "Đã kết nối Shortcut.",
      zh: "快捷指令已连接。",
    });
  } catch (error) {
    const details = errorDetails(error);
    return res
      .status(details.status)
      .json({ success: false, data: null, messages: { vi: details.message } });
  }
});

router.post("/check-in", async (req, res) => {
  let expiresAt: number | undefined;
  try {
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "";
    const session = await verifyShortcutToken(token);
    expiresAt = session.expiresAt;
    await attachAuthorizationForUser(req, session.userId);
    const input = shortcutCheckInSchema.parse(req.body ?? {});
    const log = await checkInAttendance(
      requireAuthenticatedRequestUser(req),
      {
        location: input.location
          ? { ...input.location, accuracy_m: input.location.accuracy_m ?? null }
          : undefined,
      },
      // Use Express's configured trusted proxy chain, not client-supplied IP headers.
      [req.ip || req.socket.remoteAddress],
      {
        action_time: new Date(),
        ip_address: req.ip ?? null,
        device_id: "ios-shortcut",
        session_token: null,
      },
      requireRequestAuthorization(req),
      { allowUnknownGpsAccuracy: true },
    );
    return html(res, 201, {
      success: true,
      message: "Đã ghi nhận giờ chấm công của bạn.",
      checkedInAt: log.check_in_at,
      expiresAt,
    });
  } catch (error) {
    const details = errorDetails(error);
    return html(res, details.status, {
      success: false,
      message: details.message,
      expiresAt,
    });
  }
});

router.use(requireAuth);
router.get("/connection", async (req, res) => {
  try {
    const user = await assertCheckInPermission(req);
    return sendSuccess(
      res,
      {
        ...(await shortcutConnectionStatus(user.id)),
        install_url: getShortcutInstallUrl(),
        shortcut_name:
          process.env.ATTENDANCE_SHORTCUT_NAME?.trim() || "BDuck Chấm công",
      },
      { vi: "Đã tải kết nối Shortcut.", zh: "已加载快捷指令连接。" },
    );
  } catch (error) {
    const details = errorDetails(error);
    return res
      .status(details.status)
      .json({ success: false, messages: { vi: details.message } });
  }
});
router.post("/pairing", async (req, res) => {
  try {
    const user = await assertCheckInPermission(req);
    if (!getShortcutInstallUrl())
      return res.status(503).json({
        success: false,
        messages: {
          vi: "Shortcut mẫu chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
        },
      });
    return sendSuccess(res, await createShortcutPairing(user.id), {
      vi: "Đã tạo mã kết nối.",
      zh: "已创建连接码。",
    });
  } catch (error) {
    const details = errorDetails(error);
    return res
      .status(details.status)
      .json({ success: false, messages: { vi: details.message } });
  }
});
router.delete("/connection", async (req, res) => {
  try {
    await revokeShortcutConnection(requireAuthenticatedRequestUser(req).id);
    return sendSuccess(res, null, {
      vi: "Đã thu hồi kết nối Shortcut.",
      zh: "已撤销快捷指令连接。",
    });
  } catch (error) {
    const details = errorDetails(error);
    return res
      .status(details.status)
      .json({ success: false, messages: { vi: details.message } });
  }
});

function getShortcutInstallUrl() {
  const url = process.env.ATTENDANCE_SHORTCUT_ICLOUD_URL ?? "";
  return /^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}\/?$/i.test(url)
    ? url
    : null;
}
