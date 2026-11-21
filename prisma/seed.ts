import "dotenv/config";
import {
  Prisma,
  PrismaClient,
  ProductStatus,
  Role,
  UserStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

declare const process: {
  env: Record<string, string | undefined>;
};

const prisma = new PrismaClient();

interface SeedProduct {
  title: string;
  slug: string;
  sku: string;
  description: string;
  shortDescription: string;
  price: number;
  discountPrice?: number;
  purchasePrice?: number;
  minimumStockLevel?: number;
  stock: number;
  categorySlug: string;
  brandSlug?: string;
  modelUrl: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  isFeatured: boolean;
  images: { url: string; altText: string; isPrimary: boolean }[];
}

const categories = [
  {
    name: "Shoes",
    slug: "shoes",
    description: "Premium footwear for every occasion.",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200",
  },
  {
    name: "Electronics",
    slug: "electronics",
    description: "Modern devices and audio equipment.",
    image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=1200",
  },
  {
    name: "Fashion",
    slug: "fashion",
    description: "Trendy clothing and accessories.",
    image: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200",
  },
  {
    name: "Home Decor",
    slug: "home-decor",
    description: "Beautiful pieces to elevate your space.",
    image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1200",
  },
];

const brands = [
  {
    name: "Nike",
    slug: "nike",
    description: "Athletic footwear and sportswear.",
    logo: "https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg",
  },
  {
    name: "Adidas",
    slug: "adidas",
    description: "Performance sportswear.",
    logo: "https://upload.wikimedia.org/wikipedia/commons/2/20/Adidas_Logo.svg",
  },
  {
    name: "Sony",
    slug: "sony",
    description: "Electronics and entertainment.",
    logo: "https://upload.wikimedia.org/wikipedia/commons/c/ca/Sony_logo.svg",
  },
  {
    name: "Aurora",
    slug: "aurora",
    description: "Curated home and lifestyle products.",
  },
];

const products: SeedProduct[] = [
  {
    title: "Nike Air Zoom Pegasus",
    slug: "nike-air-zoom-pegasus",
    sku: "NIKE-PEGASUS-001",
    description:
      "A responsive everyday running shoe with a breathable mesh upper and Zoom Air cushioning for long-distance comfort.",
    shortDescription: "Responsive daily running shoe with Zoom Air cushioning.",
    price: 12500,
    discountPrice: 10999,
    stock: 40,
    categorySlug: "shoes",
    brandSlug: "nike",
    modelUrl: "/models/nike-air-zoom.glb",
    position: [-2.4, 0, -3.2],
    rotation: [0, 0.35, 0],
    scale: 1,
    isFeatured: true,
    images: [
      {
        url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200",
        altText: "Nike Air Zoom Pegasus red",
        isPrimary: true,
      },
      {
        url: "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=1200",
        altText: "Nike Air Zoom Pegasus side view",
        isPrimary: false,
      },
    ],
  },
  {
    title: "Adidas Ultraboost Light",
    slug: "adidas-ultraboost-light",
    sku: "ADIDAS-UBL-002",
    description:
      "Lightweight running shoes built with a responsive Boost midsole and a supportive Primeknit upper for daily training.",
    shortDescription: "Lightweight Boost running shoe.",
    price: 14500,
    stock: 30,
    categorySlug: "shoes",
    brandSlug: "adidas",
    modelUrl: "/models/adidas-ultraboost.glb",
    position: [0, 0, -3.4],
    rotation: [0, 0, 0],
    scale: 1,
    isFeatured: true,
    images: [
      {
        url: "https://images.unsplash.com/photo-1587563871167-1ee9c731aefb?w=1200",
        altText: "Adidas Ultraboost Light",
        isPrimary: true,
      },
    ],
  },
  {
    title: "Sony WH-1000XM5 Headphones",
    slug: "sony-wh-1000xm5-headphones",
    sku: "SONY-XM5-003",
    description:
      "Industry-leading noise cancelling wireless headphones with exceptional sound quality and all-day battery life.",
    shortDescription: "Noise cancelling wireless over-ear headphones.",
    price: 32000,
    discountPrice: 29999,
    stock: 18,
    categorySlug: "electronics",
    brandSlug: "sony",
    modelUrl: "/models/sony-headphones.glb",
    position: [2.4, 0.4, -3.1],
    rotation: [0, -0.4, 0],
    scale: 1.1,
    isFeatured: true,
    images: [
      {
        url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200",
        altText: "Sony WH-1000XM5 headphones",
        isPrimary: true,
      },
      {
        url: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=1200",
        altText: "Sony headphones detail",
        isPrimary: false,
      },
    ],
  },
  {
    title: "Aurora Minimalist Desk Lamp",
    slug: "aurora-minimalist-desk-lamp",
    sku: "AURORA-LAMP-004",
    description:
      "A sculptural desk lamp with warm adjustable lighting, perfect for modern workspaces and reading corners.",
    shortDescription: "Adjustable minimalist desk lamp.",
    price: 4200,
    stock: 60,
    categorySlug: "home-decor",
    brandSlug: "aurora",
    modelUrl: "/models/desk-lamp.glb",
    position: [-2.2, 0.5, -1.6],
    rotation: [0, 0.2, 0],
    scale: 1,
    isFeatured: false,
    images: [
      {
        url: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=1200",
        altText: "Aurora minimalist desk lamp",
        isPrimary: true,
      },
    ],
  },
  {
    title: "Aurora Ceramic Vase Set",
    slug: "aurora-ceramic-vase-set",
    sku: "AURORA-VASE-005",
    description:
      "A set of three hand-finished ceramic vases in neutral tones that bring calm texture to shelves and tables.",
    shortDescription: "Set of three hand-finished ceramic vases.",
    price: 3200,
    stock: 45,
    categorySlug: "home-decor",
    brandSlug: "aurora",
    modelUrl: "/models/vase-set.glb",
    position: [2.2, 0.5, -1.6],
    rotation: [0, -0.2, 0],
    scale: 1,
    isFeatured: false,
    images: [
      {
        url: "https://images.unsplash.com/photo-1578500494198-246f612d3b3d?w=1200",
        altText: "Aurora ceramic vase set",
        isPrimary: true,
      },
    ],
  },
  {
    title: "Nike Sportswear Club Hoodie",
    slug: "nike-sportswear-club-hoodie",
    sku: "NIKE-HOODIE-006",
    description:
      "A soft cotton-blend hoodie with a relaxed fit, ribbed cuffs and the classic embroidered logo.",
    shortDescription: "Soft cotton-blend everyday hoodie.",
    price: 5500,
    stock: 75,
    categorySlug: "fashion",
    brandSlug: "nike",
    modelUrl: "/models/nike-hoodie.glb",
    position: [0, 0.6, -1.9],
    rotation: [0, 0.1, 0],
    scale: 1,
    isFeatured: false,
    images: [
      {
        url: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=1200",
        altText: "Nike Sportswear Club Hoodie",
        isPrimary: true,
      },
    ],
  },
];

async function seedSuperAdmin(): Promise<void> {
  const name = process.env.SUPER_ADMIN_NAME ?? "Super Admin";
  const email = (process.env.SUPER_ADMIN_EMAIL ?? "superadmin@3dcommerce.local")
    .trim()
    .toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  const resetPassword =
    process.env.SEED_RESET_SUPER_ADMIN_PASSWORD === "true";

  if (!password) {
    throw new Error(
      "SUPER_ADMIN_PASSWORD is required to seed the super admin account.",
    );
  }

  if (password.length < 12) {
    throw new Error(
      "SUPER_ADMIN_PASSWORD must be at least 12 characters long.",
    );
  }

  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const superAdmin = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      ...(resetPassword ? { password: hashedPassword } : {}),
    },
    create: {
      name,
      email,
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  console.log("Super admin ready:", superAdmin);
}

async function seedCatalog(): Promise<void> {
  const categoryIds = new Map<string, string>();

  for (const category of categories) {
    const record = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        image: category.image,
      },
      create: category,
      select: { id: true, slug: true },
    });

    categoryIds.set(record.slug, record.id);
  }

  const brandIds = new Map<string, string>();

  for (const brand of brands) {
    const record = await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: {
        name: brand.name,
        description: brand.description,
        logo: brand.logo ?? null,
      },
      create: brand,
      select: { id: true, slug: true },
    });

    brandIds.set(record.slug, record.id);
  }

  for (const product of products) {
    const categoryId = categoryIds.get(product.categorySlug);

    if (!categoryId) {
      throw new Error(`Missing category for seed product: ${product.sku}`);
    }

    const brandId = product.brandSlug
      ? brandIds.get(product.brandSlug)
      : undefined;

    const data = {
      title: product.title,
      slug: product.slug,
      sku: product.sku,
      description: product.description,
      shortDescription: product.shortDescription,
      price: new Prisma.Decimal(product.price),
      discountPrice: product.discountPrice
        ? new Prisma.Decimal(product.discountPrice)
        : null,
      purchasePrice: new Prisma.Decimal(
        product.purchasePrice ?? Math.round(product.price * 0.65),
      ),
      minimumStockLevel: product.minimumStockLevel ?? 5,
      stock: product.stock,
      status: ProductStatus.ACTIVE,
      isFeatured: product.isFeatured,
      categoryId,
      brandId: brandId ?? null,
      modelUrl: product.modelUrl,
      positionX: product.position[0],
      positionY: product.position[1],
      positionZ: product.position[2],
      rotationX: product.rotation[0],
      rotationY: product.rotation[1],
      rotationZ: product.rotation[2],
      scale: product.scale,
    };

    const record = await prisma.product.upsert({
      where: { sku: product.sku },
      update: data,
      create: data,
      select: { id: true, title: true },
    });

    await prisma.productImage.deleteMany({ where: { productId: record.id } });

    await prisma.productImage.createMany({
      data: product.images.map((image, index) => ({
        productId: record.id,
        imageUrl: image.url,
        altText: image.altText,
        isPrimary: image.isPrimary,
        sortOrder: index,
      })),
    });

    console.log("Product ready:", record.title);
  }

  await prisma.coupon.upsert({
    where: { code: "WELCOME10" },
    update: {
      description: "10% off your first order",
      discountPercent: new Prisma.Decimal(10),
      discountAmount: null,
      minimumAmount: new Prisma.Decimal(1000),
      maxDiscount: new Prisma.Decimal(1000),
      usageLimit: 1000,
      isActive: true,
    },
    create: {
      code: "WELCOME10",
      description: "10% off your first order",
      discountPercent: new Prisma.Decimal(10),
      minimumAmount: new Prisma.Decimal(1000),
      maxDiscount: new Prisma.Decimal(1000),
      usageLimit: 1000,
      isActive: true,
    },
  });

  console.log("Sample coupon ready: WELCOME10");
}

async function main(): Promise<void> {
  await seedSuperAdmin();
  await seedCatalog();
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    Object.assign(process, { exitCode: 1 });
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
