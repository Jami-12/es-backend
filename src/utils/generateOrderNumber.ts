import { randomInt } from "node:crypto";

const pad = (value: number): string => String(value).padStart(2, "0");

const datePart = (date: Date): string =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;

export const generateOrderNumber = (): string => {
  const random = randomInt(100000, 999999);
  return `ORD-${datePart(new Date())}-${random}`;
};

export const generateReceiptNumber = (): string => {
  const random = randomInt(100000, 999999);
  return `RCP-${datePart(new Date())}-${random}`;
};
