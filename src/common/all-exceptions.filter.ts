import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx  = host.switchToHttp()
    const res  = ctx.getResponse()
    const req  = ctx.getRequest()

    let status  = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Internal server error'
    let code    = 'INTERNAL_ERROR'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const body = exception.getResponse() as any
      message = body?.message ?? exception.message
      code    = body?.code    ?? 'HTTP_ERROR'
    } else if ((exception as any)?.name === 'CastError') {
      status  = 400
      message = `Invalid id format: ${(exception as any).value}`
      code    = 'INVALID_ID'
    } else if ((exception as any)?.name === 'ValidationError') {
      status  = 400
      message = Object.values((exception as any).errors).map((e: any) => e.message).join(', ')
      code    = 'VALIDATION_ERROR'
    }

    res.status(status).json({ success: false, code, message, path: req.url, timestamp: new Date().toISOString() })
  }
}
