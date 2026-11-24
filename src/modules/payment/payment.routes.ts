import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  confirmPaymentSchema,
  createBkashPaymentSchema,
  failPaymentSchema,
  guestInitiatePaymentSchema,
  guestReconcileCardPaymentSchema,
  initiatePaymentSchema,
  paymentWebhookSchema,
  reconcileCardPaymentSchema,
} from "../../validations/payment.validation";
import * as paymentController from "./payment.controller";

const router = Router();

router.get("/providers", paymentController.getProviderStatus);

router.post(
  "/webhook",
  validate({ body: paymentWebhookSchema }),
  paymentController.providerWebhook,
);

router.get("/bkash/callback", paymentController.providerCallback);
router.post("/bkash/callback", paymentController.providerCallback);
router.post(
  "/bkash/create",
  validate({ body: createBkashPaymentSchema }),
  paymentController.createBkashPayment,
);
router.get(
  "/bkash/create",
  validate({ query: createBkashPaymentSchema }),
  paymentController.createBkashPayment,
);
router.get("/nagad/callback", paymentController.providerCallback);
router.post("/nagad/callback", paymentController.providerCallback);
router.get("/nagad/simulate", paymentController.nagadSimulationPage);
router.post("/card/webhook", paymentController.cardWebhook);

// Guest payments are authorised by the random order token instead of a bearer
// token. These routes must stay above `authenticate`.
router.post(
  "/guest/initiate",
  validate({ body: guestInitiatePaymentSchema }),
  paymentController.guestInitiatePayment,
);
router.post(
  "/guest/card/reconcile",
  validate({ body: guestReconcileCardPaymentSchema }),
  paymentController.guestReconcileCardPayment,
);

router.use(authenticate);

router.post(
  "/initiate",
  authorize([Role.CUSTOMER]),
  validate({ body: initiatePaymentSchema }),
  paymentController.initiatePayment,
);

router.post(
  "/card/reconcile",
  authorize([Role.CUSTOMER]),
  validate({ body: reconcileCardPaymentSchema }),
  paymentController.reconcileCardPayment,
);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  paymentController.getPayment,
);

router.post(
  "/:id/confirm",
  authorize([Role.SUPER_ADMIN, Role.ADMIN]),
  validate({ params: idParamSchema, body: confirmPaymentSchema }),
  paymentController.confirmPayment,
);

router.post(
  "/:id/fail",
  authorize([Role.SUPER_ADMIN, Role.ADMIN]),
  validate({ params: idParamSchema, body: failPaymentSchema }),
  paymentController.failPayment,
);

export const paymentRoutes = router;
