import { app } from "./app";
import { isCloudinaryConfigured } from "./config/cloudinary";
import { env } from "./config/env";
import { paymentProviderStatus } from "./config/payment.config";
import { connectDatabase, disconnectDatabase } from "./config/prisma";
import { redactValue } from "./utils/redact";

const logConfigurationStatus = (): void => {
  const providers = paymentProviderStatus();

  console.log(
    `[config] payments: COD=on bKash=${providers.bkash ? "on" : "off"} Nagad=${providers.nagad ? "on" : "off"} Stripe=${providers.card ? "on" : "off"}`,
  );
  console.log(
    `[config] Cloudinary=${isCloudinaryConfigured ? "on" : "off"}`,
  );
};

const startServer = async (): Promise<void> => {
  await connectDatabase();
  logConfigurationStatus();

  const server = app.listen(env.PORT, () => {
    console.log(
      `[server] 3D E-Commerce API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
    );
  });

  let isShuttingDown = false;

  const shutdown = (signal: string): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log(`[server] Received ${signal}. Shutting down gracefully...`);

    const forceExitTimer = setTimeout(() => {
      console.error("[server] Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);

    forceExitTimer.unref();

    server.close(async (closeError) => {
      if (closeError) {
        console.error("[server] Error while closing HTTP server:", redactValue(closeError));
      }

      try {
        await disconnectDatabase();
      } catch (disconnectError) {
        console.error("[server] Error while disconnecting Prisma:", redactValue(disconnectError));
      }

      clearTimeout(forceExitTimer);
      process.exit(closeError ? 1 : 0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    console.error("[server] Unhandled promise rejection:", redactValue(reason));
    shutdown("unhandledRejection");
  });

  process.on("uncaughtException", (error) => {
    console.error("[server] Uncaught exception:", redactValue(error));
    shutdown("uncaughtException");
  });
};

// The serverless handler imports app.ts directly; only this standalone entry
// starts a listener.
if (!env.VERCEL) {
  startServer().catch(async (error: unknown) => {
    console.error("[server] Failed to start:", redactValue(error));

    try {
      await disconnectDatabase();
    } catch {
      // Ignore disconnect failures during startup failure.
    }

    process.exit(1);
  });
}

export { app };
export default app;
