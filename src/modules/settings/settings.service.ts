import { Prisma } from "@prisma/client";
import { deleteCloudinaryImage } from "../../config/cloudinary";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import type {
  SettingsResponse,
  UpdateSettingsInput,
} from "../../types/settings.types";

const SETTINGS_ID = "default";

const DEFAULT_TOGGLES = {
  showHero: true,
  showProductFinder: true,
  showMiddleCategories: true,
  showCategorySections: true,
  showNewArrivals: true,
  showBrands: true,
  showPromoBanners: true,
  showNewsletter: true,
  // Payment switches default ON so existing stores keep their current methods.
  codEnabled: true,
  bkashEnabled: true,
  nagadEnabled: true,
  stripeEnabled: true,
} as const;

const settingsInclude = {
  categorySections: {
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          image: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { category: { name: "asc" } }],
  },
} satisfies Prisma.SiteSettingsInclude;

type SettingsRecord = Prisma.SiteSettingsGetPayload<{
  include: typeof settingsInclude;
}>;

/** The settings row is created on first read so public consumers always get a full payload. */
const ensureSettings = async (
  client: Prisma.TransactionClient = prisma,
): Promise<SettingsRecord> =>
  client.siteSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...DEFAULT_TOGGLES },
    update: {},
    include: settingsInclude,
  });

const toSettingsResponse = (settings: SettingsRecord): SettingsResponse => ({
  id: settings.id,
  siteName: settings.siteName?.trim() || env.STORE_NAME,
  navbarLogoUrl: settings.navbarLogoUrl,
  navbarLogoPublicId: settings.navbarLogoPublicId,
  showHero: settings.showHero,
  showProductFinder: settings.showProductFinder,
  showMiddleCategories: settings.showMiddleCategories,
  showCategorySections: settings.showCategorySections,
  showNewArrivals: settings.showNewArrivals,
  showBrands: settings.showBrands,
  showPromoBanners: settings.showPromoBanners,
  showNewsletter: settings.showNewsletter,
  codEnabled: settings.codEnabled,
  bkashEnabled: settings.bkashEnabled,
  nagadEnabled: settings.nagadEnabled,
  stripeEnabled: settings.stripeEnabled,
  categorySections: settings.categorySections.map((section) => ({
    id: section.id,
    categoryId: section.categoryId,
    categoryName: section.category.name,
    categorySlug: section.category.slug,
    categoryImage: section.category.image,
    isVisible: section.isVisible,
    sortOrder: section.sortOrder,
  })),
  visibleCategoryIds: settings.categorySections
    .filter((section) => section.isVisible)
    .map((section) => section.categoryId),
  updatedAt: settings.updatedAt.toISOString(),
});

export const getSettings = async (): Promise<SettingsResponse> =>
  toSettingsResponse(await ensureSettings());

export const updateSettings = async (
  actorId: string,
  input: UpdateSettingsInput,
  ipAddress?: string,
): Promise<SettingsResponse> => {
  const existing = await ensureSettings();

  const data: Prisma.SiteSettingsUpdateInput = {};

  if (input.siteName !== undefined) {
    data.siteName = input.siteName?.trim() || null;
  }

  // An explicit null logo URL clears both the URL and its Cloudinary reference.
  const nextLogoPublicId =
    input.navbarLogoPublicId !== undefined
      ? input.navbarLogoPublicId
      : input.navbarLogoUrl === null
        ? null
        : existing.navbarLogoPublicId;

  if (input.navbarLogoUrl !== undefined || input.navbarLogoPublicId !== undefined) {
    data.navbarLogoUrl = input.navbarLogoUrl ?? null;
    data.navbarLogoPublicId = nextLogoPublicId;
  }

  if (input.showHero !== undefined) {
    data.showHero = input.showHero;
  }
  if (input.showProductFinder !== undefined) {
    data.showProductFinder = input.showProductFinder;
  }
  if (input.showMiddleCategories !== undefined) {
    data.showMiddleCategories = input.showMiddleCategories;
  }
  if (input.showCategorySections !== undefined) {
    data.showCategorySections = input.showCategorySections;
  }
  if (input.showNewArrivals !== undefined) {
    data.showNewArrivals = input.showNewArrivals;
  }
  if (input.showBrands !== undefined) {
    data.showBrands = input.showBrands;
  }
  if (input.showPromoBanners !== undefined) {
    data.showPromoBanners = input.showPromoBanners;
  }
  if (input.showNewsletter !== undefined) {
    data.showNewsletter = input.showNewsletter;
  }
  if (input.codEnabled !== undefined) {
    data.codEnabled = input.codEnabled;
  }
  if (input.bkashEnabled !== undefined) {
    data.bkashEnabled = input.bkashEnabled;
  }
  if (input.nagadEnabled !== undefined) {
    data.nagadEnabled = input.nagadEnabled;
  }
  if (input.stripeEnabled !== undefined) {
    data.stripeEnabled = input.stripeEnabled;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await ensureSettings(tx);

    if (input.categorySections !== undefined) {
      // De-duplicate so a repeated id cannot break the unique constraint.
      const sections = new Map<
        string,
        { categoryId: string; isVisible: boolean; sortOrder: number }
      >();

      for (const section of input.categorySections) {
        sections.set(section.categoryId, {
          categoryId: section.categoryId,
          isVisible: section.isVisible ?? true,
          sortOrder: section.sortOrder ?? 0,
        });
      }

      const values = Array.from(sections.values());

      if (values.length > 0) {
        const categories = await tx.category.findMany({
          where: { id: { in: values.map((section) => section.categoryId) } },
          select: { id: true },
        });

        if (categories.length !== values.length) {
          throw ApiError.badRequest(
            "One or more selected categories do not exist",
          );
        }
      }

      await tx.homeCategorySection.deleteMany({
        where: { settingsId: SETTINGS_ID },
      });

      if (values.length > 0) {
        await tx.homeCategorySection.createMany({
          data: values.map((section) => ({
            settingsId: SETTINGS_ID,
            ...section,
          })),
        });
      }
    }

    const result = await tx.siteSettings.update({
      where: { id: SETTINGS_ID },
      data,
      include: settingsInclude,
    });

    await recordAudit(
      {
        userId: actorId,
        action: "UPDATE_SITE_SETTINGS",
        entity: "SiteSettings",
        entityId: SETTINGS_ID,
        description: "Updated storefront settings",
        oldData: existing,
        newData: result,
        ipAddress,
      },
      tx,
    );

    return result;
  });

  // Best-effort cleanup: a missing Cloudinary configuration must not fail an
  // otherwise successful settings update.
  if (
    existing.navbarLogoPublicId &&
    existing.navbarLogoPublicId !== nextLogoPublicId
  ) {
    try {
      await deleteCloudinaryImage(existing.navbarLogoPublicId);
    } catch (error) {
      console.warn("[settings] Could not remove the previous navbar logo", {
        publicId: existing.navbarLogoPublicId,
        error: error instanceof Error ? error.message : "UnknownError",
      });
    }
  }

  return toSettingsResponse(updated);
};
