import { Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import type {
  ReceiptSettingsResponse,
  UpdateReceiptSettingsInput,
} from "../../types/receipt-settings.types";

const SETTINGS_ID = "default";
const DEFAULT_FOOTER_NOTE = "Thank you for shopping with us.";

type ReceiptSettingsRecord = Prisma.ReceiptSettingsGetPayload<{}>;

/** The singleton row is created on first read so receipts always have branding. */
const ensureReceiptSettings = async (
  client: Prisma.TransactionClient = prisma,
): Promise<ReceiptSettingsRecord> =>
  client.receiptSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  });

const toResponse = (settings: ReceiptSettingsRecord): ReceiptSettingsResponse => ({
  id: settings.id,
  storeName: settings.storeName?.trim() || env.STORE_NAME,
  tagline: settings.tagline?.trim() || null,
  logoUrl: settings.logoUrl?.trim() || null,
  footerNote: settings.footerNote?.trim() || DEFAULT_FOOTER_NOTE,
  contactPhone: settings.contactPhone?.trim() || env.STORE_PHONE,
  contactEmail: settings.contactEmail?.trim() || env.STORE_EMAIL,
  contactAddress: settings.contactAddress?.trim() || env.STORE_ADDRESS,
  showLogo: settings.showLogo,
  showSize: settings.showSize,
  showColor: settings.showColor,
  showPaymentMethod: settings.showPaymentMethod,
  showTransactionId: settings.showTransactionId,
  showCustomer: settings.showCustomer,
  showShippingAddress: settings.showShippingAddress,
  updatedAt: settings.updatedAt.toISOString(),
});

const normaliseText = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.trim() || null;
};

export const getReceiptSettings = async (): Promise<ReceiptSettingsResponse> =>
  toResponse(await ensureReceiptSettings());

export const updateReceiptSettings = async (
  actorId: string,
  input: UpdateReceiptSettingsInput,
  ipAddress?: string,
): Promise<ReceiptSettingsResponse> => {
  const existing = await ensureReceiptSettings();
  const data: Prisma.ReceiptSettingsUpdateInput = {};

  if (input.storeName !== undefined) data.storeName = normaliseText(input.storeName);
  if (input.tagline !== undefined) data.tagline = normaliseText(input.tagline);
  if (input.logoUrl !== undefined) data.logoUrl = normaliseText(input.logoUrl);
  if (input.footerNote !== undefined) data.footerNote = normaliseText(input.footerNote);
  if (input.contactPhone !== undefined) data.contactPhone = normaliseText(input.contactPhone);
  if (input.contactEmail !== undefined) data.contactEmail = normaliseText(input.contactEmail);
  if (input.contactAddress !== undefined) data.contactAddress = normaliseText(input.contactAddress);

  if (input.showLogo !== undefined) data.showLogo = input.showLogo;
  if (input.showSize !== undefined) data.showSize = input.showSize;
  if (input.showColor !== undefined) data.showColor = input.showColor;
  if (input.showPaymentMethod !== undefined) data.showPaymentMethod = input.showPaymentMethod;
  if (input.showTransactionId !== undefined) data.showTransactionId = input.showTransactionId;
  if (input.showCustomer !== undefined) data.showCustomer = input.showCustomer;
  if (input.showShippingAddress !== undefined) {
    data.showShippingAddress = input.showShippingAddress;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await ensureReceiptSettings(tx);

    const result = await tx.receiptSettings.update({
      where: { id: SETTINGS_ID },
      data,
    });

    await recordAudit(
      {
        userId: actorId,
        action: "UPDATE_RECEIPT_SETTINGS",
        entity: "ReceiptSettings",
        entityId: SETTINGS_ID,
        description: "Updated printable receipt settings",
        oldData: existing,
        newData: result,
        ipAddress,
      },
      tx,
    );

    return result;
  });

  return toResponse(updated);
};

/** Used by receipt generation to fail loudly if the table was never migrated. */
export const assertReceiptSettingsAvailable = async (): Promise<void> => {
  try {
    await ensureReceiptSettings();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      throw ApiError.internal(
        "Receipt settings table is missing. Run the latest Prisma migration.",
      );
    }
    throw error;
  }
};
