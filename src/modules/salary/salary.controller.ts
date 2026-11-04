import type {
  CreateSalaryPaymentInput,
  SalaryListQuery,
} from "../../types/salary.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as salaryService from "./salary.service";

export const createSalaryPayment = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const salary = await salaryService.createSalaryPayment(
    user,
    req.body as CreateSalaryPaymentInput,
    req.ip,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { salary },
    message: "Salary payment recorded successfully",
  });
});

export const listSalaryPayments = asyncHandler(async (req, res) => {
  const result = await salaryService.listSalaryPayments(
    req.query as unknown as SalaryListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Salary payments retrieved successfully",
  });
});

export const getSalaryPayment = asyncHandler(async (req, res) => {
  const salary = await salaryService.getSalaryPaymentById(req.params.id);

  sendSuccess(res, {
    data: { salary },
    message: "Salary payment retrieved successfully",
  });
});

export const paySalaryPayment = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const body = req.body as { paymentDate?: string } | undefined;
  const salary = await salaryService.paySalaryPayment(
    user,
    req.params.id,
    body?.paymentDate,
    req.ip,
  );

  sendSuccess(res, {
    data: { salary },
    message: "Salary payment completed successfully",
  });
});

export const cancelSalaryPayment = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const salary = await salaryService.cancelSalaryPayment(
    user,
    req.params.id,
    req.ip,
  );

  sendSuccess(res, {
    data: { salary },
    message: "Salary payment cancelled successfully",
  });
});

export const getSalarySummary = asyncHandler(async (req, res) => {
  const year = Number(req.query.year);
  const summary = await salaryService.getSalarySummary(year);

  sendSuccess(res, {
    data: { summary },
    message: "Salary summary retrieved successfully",
  });
});
