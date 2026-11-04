import type {
  BillListQuery,
  CreateExpenseInput,
  ExpenseListQuery,
  UpdateExpenseInput,
} from "../../types/expense.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as expenseService from "./expense.service";

export const createExpense = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const expense = await expenseService.createExpense(
    user,
    req.body as CreateExpenseInput,
    req.ip,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { expense },
    message: "Expense created successfully",
  });
});

export const listExpenses = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const result = await expenseService.listExpenses(
    user,
    req.query as unknown as ExpenseListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Expenses retrieved successfully",
  });
});

export const getExpense = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const expense = await expenseService.getExpenseById(user, req.params.id);

  sendSuccess(res, {
    data: { expense },
    message: "Expense retrieved successfully",
  });
});

export const updateExpense = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const expense = await expenseService.updateExpense(
    user,
    req.params.id,
    req.body as UpdateExpenseInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { expense },
    message: "Expense updated successfully",
  });
});

export const cancelExpense = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const expense = await expenseService.cancelExpense(
    user,
    req.params.id,
    req.ip,
  );

  sendSuccess(res, {
    data: { expense },
    message: "Expense cancelled successfully",
  });
});

export const getExpenseSummary = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const summary = await expenseService.getExpenseSummary(user);

  sendSuccess(res, {
    data: { summary },
    message: "Expense summary retrieved successfully",
  });
});

export const listBills = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const result = await expenseService.listBills(
    user,
    req.query as unknown as BillListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Bills retrieved successfully",
  });
});
