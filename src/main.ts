// ── Fix: Node.js v22+ Windows DNS SRV resolution bug ──────────────────────
import { setServers } from "node:dns/promises";
setServers(["8.8.8.8", "8.8.4.4"]);
// ──────────────────────────────────────────────────────────────────────────

import "reflect-metadata";
import * as dotenv from "dotenv";
dotenv.config();

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");

  // FIX BUG#18: restrict CORS to known origins in production
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : "*",
    methods: "GET,POST,PATCH,DELETE,OPTIONS",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true,
  });

  app.use(helmet());
  app.use(compression());
  app.use(morgan("combined"));

  // FIX BUG#20: global filter catches raw Mongoose errors and formats them cleanly
  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false, // keep false — frontend may send extra fields during dev
    }),
  );

  const config = new DocumentBuilder()
    .setTitle("Pikly Store API")
    .setDescription(
      "Full-featured eCommerce REST API — 120+ products, JWT auth, cart, orders, wishlist, compare and more.",
    )
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: "alpha",
      operationsSorter: "alpha",
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`\n🚀 Pikly Store API running on: http://localhost:${port}/api`);
  console.log(
    `📖 Swagger docs:               http://localhost:${port}/api/docs\n`,
  );
}

bootstrap();
