import { z } from "zod";

const salarySchema = z.coerce
  .number()
  .finite("Salary must be a valid number")
  .positive("Salary must be greater than zero")
  .max(99_999_999.99, "Salary is too large");

const dateStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  position: z.string().trim().min(2).max(120),
  department: z.string().trim().max(120).optional(),
  monthlySalary: salarySchema,
  joiningDate: dateStringSchema,
  isActive: z.boolean().optional(),
});

export const updateEmployeeSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    phone: z.string().trim().min(6).max(30).nullable().optional(),
    position: z.string().trim().min(2).max(120).optional(),
    department: z.string().trim().max(120).nullable().optional(),
    monthlySalary: salarySchema.optional(),
    joiningDate: dateStringSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const employeeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  department: z.string().trim().max(120).optional(),
  search: z.string().trim().max(200).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
