import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  createEmployeeSchema,
  employeeListQuerySchema,
  updateEmployeeSchema,
} from "../../validations/employee.validation";
import * as employeeController from "./employee.controller";

const router = Router();

router.use(authenticate);
router.use(authorize([Role.SUPER_ADMIN]));

router.get("/summary", employeeController.getEmployeeSummary);

router.get(
  "/",
  validate({ query: employeeListQuerySchema }),
  employeeController.listEmployees,
);

router.post(
  "/",
  validate({ body: createEmployeeSchema }),
  employeeController.createEmployee,
);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  employeeController.getEmployee,
);

router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateEmployeeSchema }),
  employeeController.updateEmployee,
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  employeeController.deactivateEmployee,
);

export const employeeRoutes = router;
