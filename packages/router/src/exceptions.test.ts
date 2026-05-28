/**
 * HTTP exception classes — covers the full ladder of status codes the
 * router serialises into responses (`BadRequest`, `Unauthorized`,
 * `Forbidden`, `NotFound`, `Conflict`, `Locked`, `UnprocessableEntity`,
 * `InternalServerError`) plus the `data` passthrough that the
 * `Conflict`/`Locked` codepaths rely on for the update-flow contract.
 */

import { describe, expect, test } from 'bun:test';
import {
  BadRequest,
  Conflict,
  Forbidden,
  HttpException,
  InternalServerError,
  Locked,
  NotFound,
  Unauthorized,
  UnprocessableEntity,
} from './exceptions';

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

describe('Conflict (409)', () => {
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

  test('forwards structured data to the body', () => {
    const ex = new Conflict('Update refused', {
      code: 'UPDATE_DEV_MODE',
      guidance: 'Stop the dev server.',
    });
    expect(ex.status).toBe(409);
    expect(ex.data).toEqual({
      code: 'UPDATE_DEV_MODE',
      guidance: 'Stop the dev server.',
    });
  });
});

describe('Locked (423)', () => {
  test('has 423 status', () => {
    expect(new Locked().status).toBe(423);
  });

  test('default message identifies the condition', () => {
    expect(new Locked().message).toBe('Locked');
  });

  test('forwards custom message + data to the body', () => {
    const e = new Locked('Update in progress', { since: '2026-05-27T00:00:00Z' });
    expect(e.message).toBe('Update in progress');
    expect(e.data).toEqual({ since: '2026-05-27T00:00:00Z' });
  });

  test('name pins instanceof matching', () => {
    expect(new Locked().name).toBe('Locked');
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
      errors: ['field required'],
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
    expect(new Locked()).toBeInstanceOf(HttpException);
    expect(new UnprocessableEntity()).toBeInstanceOf(HttpException);
    expect(new InternalServerError()).toBeInstanceOf(HttpException);
  });

  test('all exceptions extend Error', () => {
    expect(new BadRequest()).toBeInstanceOf(Error);
    expect(new HttpException(400, 'test')).toBeInstanceOf(Error);
  });
});
