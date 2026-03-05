import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";

// FIX BUG#20: without this filter, raw Mongoose CastErrors (invalid ObjectId etc.)
// leak internal stack traces to the client. This filter intercepts all unhandled
// exceptions and returns a clean, consistent error shape.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "An unexpected error occurred";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as any;
      code = res.code ?? "HTTP_ERROR";
      message = res.message ?? exception.message;
    } else if ((exception as any)?.name === "CastError") {
      // Mongoose throws CastError when an invalid ObjectId is passed (e.g. /users/abc)
      status = HttpStatus.BAD_REQUEST;
      code = "INVALID_ID";
      message = "Invalid ID format";
    } else if ((exception as any)?.name === "ValidationError") {
      status = HttpStatus.BAD_REQUEST;
      code = "VALIDATION_ERROR";
      message = (exception as any).message;
    }

    response.status(status).json({
      success: false,
      error: { code, message, statusCode: status },
    });
  }
}
