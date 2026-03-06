import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus,
} from '@nestjs/common'

// A single filter that handles every unhandled exception so the client always
// receives a predictable JSON shape instead of raw stack traces or HTML errors.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse()
    const req = ctx.getRequest()

    let status  = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Internal server error'
    let code    = 'INTERNAL_ERROR'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const body = exception.getResponse() as Record<string, any> | string
      if (typeof body === 'object') {
        message = body?.message ?? exception.message
        code    = body?.code    ?? 'HTTP_ERROR'
      }
    } else if (exception instanceof Error) {
      const err = exception as Record<string, any>
      if (err.name === 'CastError') {
        // Mongoose CastError: an invalid ObjectId or type mismatch.
        status  = HttpStatus.BAD_REQUEST
        message = `Invalid value: ${err.value ?? 'unknown'}`
        code    = 'INVALID_ID'
      } else if (err.name === 'ValidationError') {
        // Mongoose schema-level ValidationError.
        status  = HttpStatus.BAD_REQUEST
        const errors = err.errors as Record<string, any>
        message = Object.values(errors ?? {})
          .map((e: any) => typeof e === 'object' ? e.message : String(e))
          .filter(Boolean)
          .join(', ')
        code = 'VALIDATION_ERROR'
      } else if (err.code === 11000) {
        // MongoDB duplicate key error — surfaces when a unique index is violated.
        // Return a 409 Conflict rather than a 500 so the client knows it's a
        // uniqueness issue, not an unexpected server failure.
        status  = HttpStatus.CONFLICT
        message = 'A record with this value already exists'
        code    = 'DUPLICATE_KEY'
      }
    }

    res.status(status).json({
      success:   false,
      code,
      message,
      path:      req.url,
      timestamp: new Date().toISOString(),
    })
  }
}
