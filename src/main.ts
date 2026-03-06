import 'reflect-metadata'
import * as dotenv from 'dotenv'
dotenv.config()

// ── Environment validation — fail fast before anything else starts ──────────
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET']
const missingEnv   = REQUIRED_ENV.filter(k => !process.env[k])
if (missingEnv.length > 0) {
  console.error(`\n❌  Missing required environment variables: ${missingEnv.join(', ')}`)
  console.error('    Create a .env file based on .env.example and set these values.\n')
  process.exit(1)
}

import { setDefaultResultOrder } from 'node:dns'
setDefaultResultOrder('ipv4first')

import { NestFactory }    from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule }              from './app.module'
import { AllExceptionsFilter }    from './common/all-exceptions.filter'
import helmet      from 'helmet'
import compression from 'compression'
import morgan      from 'morgan'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api')

  // ── CORS ─────────────────────────────────────────────────────────────────
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : '*'
  app.enableCors({
    origin:         allowedOrigins,
    methods:        'GET,POST,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
  })

  // ── Security & utility middleware ─────────────────────────────────────────
  app.use(helmet())
  app.use(compression())
  app.use(morgan('combined'))

  // ── Global exception filter ───────────────────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter())

  // ── Global validation pipe ────────────────────────────────────────────────
  // whitelist:true strips fields not in the DTO.
  // forbidNonWhitelisted:true throws a 400 for unrecognised fields.
  // transform:true coerces query strings ("20") to the declared type (number).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:            true,
      transform:            true,
      forbidNonWhitelisted: true,
    }),
  )

  // ── Swagger — only in non-production environments ─────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Pikly Store API')
      .setDescription('Full-featured eCommerce REST API — JWT auth, cart, orders, wishlist, compare and more.')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build()

    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter:       'alpha',
        operationsSorter: 'alpha',
      },
    })
    console.log(`📖 Swagger docs: http://localhost:${process.env.PORT ?? 3000}/api/docs`)
  }

  const port = process.env.PORT ?? 3000
  await app.listen(port)
  console.log(`\n🚀 Pikly Store API running on: http://localhost:${port}/api\n`)
}

bootstrap()
