import type {
  CreateEmployeeInput,
  EmployeeListQuery,
  UpdateEmployeeInput,
} from "../../types/employee.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as employeeService from "./employee.service";

export const createEmployee = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const employee = await employeeService.createEmployee(
    user,
    req.body as CreateEmployeeInput,
    req.ip,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { employee },
    message: "Employee created successfully",
  });
});

export const listEmployees = asyncHandler(async (req, res) => {
  const result = await employeeService.listEmployees(
    req.query as unknown as EmployeeListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Employees retrieved successfully",
  });
});

export const getEmployee = asyncHandler(async (req, res) => {
  const employee = await employeeService.getEmployeeById(req.params.id);

  sendSuccess(res, {
    data: { employee },
    message: "Employee retrieved successfully",
  });
});

export const updateEmployee = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const employee = await employeeService.updateEmployee(
    user,
    req.params.id,
    req.body as UpdateEmployeeInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { employee },
    message: "Employee updated successfully",
  });
});

export const deactivateEmployee = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const employee = await employeeService.deactivateEmployee(
    user,
    req.params.id,
    req.ip,
  );

  sendSuccess(res, {
    data: { employee },
    message: "Employee deactivated successfully",
  });
});

export const getEmployeeSummary = asyncHandler(async (_req, res) => {
  const summary = await employeeService.getEmployeeSummary();

  sendSuccess(res, {
    data: { summary },
    message: "Employee summary retrieved successfully",
  });
});
