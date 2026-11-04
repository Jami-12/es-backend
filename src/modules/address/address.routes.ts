import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  createAddressSchema,
  updateAddressSchema,
} from "../../validations/address.validation";
import * as addressController from "./address.controller";

const router = Router();

router.use(authenticate, authorize([Role.CUSTOMER]));

router.get("/", addressController.listAddresses);

router.post(
  "/",
  validate({ body: createAddressSchema }),
  addressController.createAddress,
);

router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateAddressSchema }),
  addressController.updateAddress,
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  addressController.deleteAddress,
);

export const addressRoutes = router;
