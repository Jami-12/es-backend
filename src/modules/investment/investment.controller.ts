import type {
  CreateInvestmentInput,
  InvestmentListQuery,
  UpdateInvestmentInput,
} from "../../types/investment.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as investmentService from "./investment.service";

export const createInvestment = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const investment = await investmentService.createInvestment(
    user,
    req.body as CreateInvestmentInput,
    req.ip,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { investment },
    message: "Investment created successfully",
  });
});

export const listInvestments = asyncHandler(async (req, res) => {
  const investments = await investmentService.listInvestments(
    req.query as unknown as InvestmentListQuery,
  );

  sendSuccess(res, {
    data: investments,
    message: "Investments retrieved successfully",
  });
});

export const getInvestment = asyncHandler(async (req, res) => {
  const investment = await investmentService.getInvestmentById(req.params.id);

  sendSuccess(res, {
    data: { investment },
    message: "Investment retrieved successfully",
  });
});

export const updateInvestment = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const investment = await investmentService.updateInvestment(
    req.params.id,
    req.body as UpdateInvestmentInput,
    user,
    req.ip,
  );

  sendSuccess(res, {
    data: { investment },
    message: "Investment updated successfully",
  });
});

export const deleteInvestment = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  await investmentService.deleteInvestment(req.params.id, user, req.ip);

  sendSuccess(res, {
    data: null,
    message: "Investment deleted successfully",
  });
});

export const getInvestmentSummary = asyncHandler(async (_req, res) => {
  const summary = await investmentService.getInvestmentSummary();

  sendSuccess(res, {
    data: { summary },
    message: "Investment summary retrieved successfully",
  });
});
