import { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Base HTTP exception class.
 * Throw these in route handlers for automatic error responses.
 */
export class HttpException extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    message: string,
    public readonly data?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'HttpException';
  }
}

/** 400 Bad Request */
export class BadRequest extends HttpException {
  constructor(message = 'Bad request') {
    super(400, message);
    this.name = 'BadRequest';
  }
}

/** 401 Unauthorized */
export class Unauthorized extends HttpException {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'Unauthorized';
  }
}

/** 403 Forbidden */
export class Forbidden extends HttpException {
  constructor(message = 'Forbidden') {
    super(403, message);
    this.name = 'Forbidden';
  }
}

/** 404 Not Found */
export class NotFound extends HttpException {
  constructor(message = 'Not found') {
    super(404, message);
    this.name = 'NotFound';
  }
}

/** 409 Conflict */
export class Conflict extends HttpException {
  constructor(message = 'Conflict') {
    super(409, message);
    this.name = 'Conflict';
  }
}

/** 422 Unprocessable Entity */
export class UnprocessableEntity extends HttpException {
  constructor(message = 'Unprocessable entity', data?: Record<string, unknown>) {
    super(422, message, data);
    this.name = 'UnprocessableEntity';
  }
}

/** 500 Internal Server Error */
export class InternalServerError extends HttpException {
  constructor(message = 'Internal server error') {
    super(500, message);
    this.name = 'InternalServerError';
  }
}
