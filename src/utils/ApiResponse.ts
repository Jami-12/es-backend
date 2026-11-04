import type { Response } from "express";

export interface ApiResponseBody<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: unknown;
}

export interface SendSuccessOptions<T> {
  statusCode?: number;
  data: T;
  message?: string;
}

export interface SendErrorOptions {
  statusCode?: number;
  message: string;
  error?: unknown;
}

export const sendSuccess = <T>(
  res: Response,
  options: SendSuccessOptions<T>,
): Response<ApiResponseBody<T>> => {
  const body: ApiResponseBody<T> = {
    success: true,
    data: options.data,
  };

  if (options.message) {
    body.message = options.message;
  }

  return res.status(options.statusCode ?? 200).json(body);
};

export const sendError = (
  res: Response,
  options: SendErrorOptions,
): Response<ApiResponseBody<undefined>> => {
  const body: ApiResponseBody<undefined> = {
    success: false,
    message: options.message,
  };

  if (options.error !== undefined) {
    body.error = options.error;
  }

  return res.status(options.statusCode ?? 500).json(body);
};
