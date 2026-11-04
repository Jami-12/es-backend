import type {
  CouponListQuery,
  CreateCouponInput,
  UpdateCouponInput,
  ValidateCouponInput,
} from "../../types/coupon.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as couponService from "./coupon.service";

export const listCoupons = asyncHandler(async (req, res) => {
  const result = await couponService.listCoupons(
    req.query as unknown as CouponListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Coupons retrieved successfully",
  });
});

export const getCoupon = asyncHandler(async (req, res) => {
  const coupon = await couponService.getCouponById(req.params.id);

  sendSuccess(res, {
    data: { coupon },
    message: "Coupon retrieved successfully",
  });
});

export const createCoupon = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const coupon = await couponService.createCoupon(
    actor.id,
    req.body as CreateCouponInput,
    req.ip,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { coupon },
    message: "Coupon created successfully",
  });
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const coupon = await couponService.updateCoupon(
    actor.id,
    req.params.id,
    req.body as UpdateCouponInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { coupon },
    message: "Coupon updated successfully",
  });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  await couponService.deleteCoupon(actor.id, req.params.id, req.ip);

  sendSuccess(res, {
    data: { id: req.params.id },
    message: "Coupon deleted successfully",
  });
});

export const validateCoupon = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const input = req.body as ValidateCouponInput;
  const result = await couponService.validateCouponForUser(user.id, input.code);

  sendSuccess(res, {
    data: result,
    message: "Coupon is valid",
  });
});
