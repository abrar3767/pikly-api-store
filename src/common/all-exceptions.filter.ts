import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'

// A single filter that handles every unhandled exception so the client always
// receives a predictable JSON shape instead of raw stack traces or HTML errors.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse()
    const req = ctx.getRequest()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Internal server error'
    let code = 'INTERNAL_ERROR'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const body = exception.getResponse() as any
      message = body?.message ?? exception.message
      code = body?.code ?? 'HTTP_ERROR'
    } else if ((exception as any)?.name === 'CastError') {
      // Mongoose CastError: an invalid ObjectId or type mismatch.
      status = HttpStatus.BAD_REQUEST
      message = `Invalid value: ${(exception as any).value}`
      code = 'INVALID_ID'
    } else if ((exception as any)?.name === 'ValidationError') {
      // Mongoose schema-level ValidationError.
      status = HttpStatus.BAD_REQUEST
      message = Object.values((exception as any).errors)
        .map((e: any) => e.message)
        .join(', ')
      code = 'VALIDATION_ERROR'
    } else if ((exception as any)?.code === 11000) {
      // MongoDB duplicate key error — surfaces when a unique index is violated.
      // Return a 409 Conflict rather than a 500 so the client knows it's a
      // uniqueness issue, not an unexpected server failure.
      status = HttpStatus.CONFLICT
      message = 'A record with this value already exists'
      code = 'DUPLICATE_KEY'
    }

    res.status(status).json({
      success: false,
      code,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    })
  }
}
