import type { AuditLogListQuery } from "../../types/audit.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import * as auditService from "./audit.service";

export const listAuditLogs = asyncHandler(async (req, res) => {
  const result = await auditService.listAuditLogs(
    req.query as unknown as AuditLogListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Audit logs retrieved successfully",
  });
});
