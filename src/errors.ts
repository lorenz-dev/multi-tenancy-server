export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public errorCode?: string,
    public isOperational = true,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        statusCode: this.statusCode,
        ...(this.errorCode && { errorCode: this.errorCode }),
        ...(this.metadata && { metadata: this.metadata }),
      },
    };
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403);
  }
}

export class ValidationError extends AppError {
  public errors?: Record<string, unknown>;

  constructor(message: string, errors?: Record<string, unknown>) {
    super(message, 400);
    this.errors = errors;
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        statusCode: this.statusCode,
        ...(this.errors && { errors: this.errors }),
      },
    };
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, errorCode: string, metadata?: Record<string, any>) {
    super(message, 422, errorCode, true, metadata);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, undefined, false);
  }
}
