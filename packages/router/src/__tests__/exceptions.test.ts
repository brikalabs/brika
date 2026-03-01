/**
 * Tests for HTTP exception classes
 */

import { describe, expect, test } from 'bun:test';
import {
  BadRequest,
  Conflict,
  Forbidden,
  HttpException,
  InternalServerError,
  NotFound,
  Unauthorized,
  UnprocessableEntity,
} from '../exceptions';

describe('HttpException', () => {
  test('creates exception with status and message', () => {
    const ex = new HttpException(418, 'I am a teapot');

    expect(ex.status).toBe(418);
    expect(ex.message).toBe('I am a teapot');
    expect(ex.name).toBe('HttpException');
  });

  test('accepts optional data', () => {
    const data = {
      field: 'test',
      reason: 'invalid',
    };
    const ex = new HttpException(400, 'Bad request', data);

    expect(ex.data).toEqual(data);
  });
});

describe('BadRequest', () => {
  test('uses default message', () => {
    const ex = new BadRequest();

    expect(ex.status).toBe(400);
    expect(ex.message).toBe('Bad request');
    expect(ex.name).toBe('BadRequest');
  });

  test('accepts custom message', () => {
    const ex = new BadRequest('Invalid input');

    expect(ex.message).toBe('Invalid input');
  });
});

describe('Unauthorized', () => {
  test('uses default message', () => {
    const ex = new Unauthorized();

    expect(ex.status).toBe(401);
    expect(ex.message).toBe('Unauthorized');
    expect(ex.name).toBe('Unauthorized');
  });

  test('accepts custom message', () => {
    const ex = new Unauthorized('Token expired');

    expect(ex.message).toBe('Token expired');
  });
});

describe('Forbidden', () => {
  test('uses default message', () => {
    const ex = new Forbidden();

    expect(ex.status).toBe(403);
    expect(ex.message).toBe('Forbidden');
    expect(ex.name).toBe('Forbidden');
  });

  test('accepts custom message', () => {
    const ex = new Forbidden('Access denied');

    expect(ex.message).toBe('Access denied');
  });
});

describe('NotFound', () => {
  test('uses default message', () => {
    const ex = new NotFound();

    expect(ex.status).toBe(404);
    expect(ex.message).toBe('Not found');
    expect(ex.name).toBe('NotFound');
  });

  test('accepts custom message', () => {
    const ex = new NotFound('Resource does not exist');

    expect(ex.message).toBe('Resource does not exist');
  });
});

describe('Conflict', () => {
  test('uses default message', () => {
    const ex = new Conflict();

    expect(ex.status).toBe(409);
    expect(ex.message).toBe('Conflict');
    expect(ex.name).toBe('Conflict');
  });

  test('accepts custom message', () => {
    const ex = new Conflict('Resource already exists');

    expect(ex.message).toBe('Resource already exists');
  });
});

describe('UnprocessableEntity', () => {
  test('uses default message', () => {
    const ex = new UnprocessableEntity();

    expect(ex.status).toBe(422);
    expect(ex.message).toBe('Unprocessable entity');
    expect(ex.name).toBe('UnprocessableEntity');
  });

  test('accepts custom message and data', () => {
    const data = {
      errors: [
        'field required',
      ],
    };
    const ex = new UnprocessableEntity('Validation failed', data);

    expect(ex.message).toBe('Validation failed');
    expect(ex.data).toEqual(data);
  });
});

describe('InternalServerError', () => {
  test('uses default message', () => {
    const ex = new InternalServerError();

    expect(ex.status).toBe(500);
    expect(ex.message).toBe('Internal server error');
    expect(ex.name).toBe('InternalServerError');
  });

  test('accepts custom message', () => {
    const ex = new InternalServerError('Database connection failed');

    expect(ex.message).toBe('Database connection failed');
  });
});

describe('Exception inheritance', () => {
  test('all exceptions extend HttpException', () => {
    expect(new BadRequest()).toBeInstanceOf(HttpException);
    expect(new Unauthorized()).toBeInstanceOf(HttpException);
    expect(new Forbidden()).toBeInstanceOf(HttpException);
    expect(new NotFound()).toBeInstanceOf(HttpException);
    expect(new Conflict()).toBeInstanceOf(HttpException);
    expect(new UnprocessableEntity()).toBeInstanceOf(HttpException);
    expect(new InternalServerError()).toBeInstanceOf(HttpException);
  });

  test('all exceptions extend Error', () => {
    expect(new BadRequest()).toBeInstanceOf(Error);
    expect(new HttpException(400, 'test')).toBeInstanceOf(Error);
  });
});
