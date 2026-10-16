import { ArgumentsHost, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiExceptionFilter } from './api-exception.filter.js';

function respondTo(exception: unknown) {
  const sent = { status: 0, body: {} as { error: Record<string, unknown> } };
  const response = {
    status(status: number) {
      sent.status = status;
      return response;
    },
    json(body: typeof sent.body) {
      sent.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: 'req-1' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(exception, host);
  return sent;
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('db says no', {
    code,
    clientVersion: 'test',
  });
}

describe('ApiExceptionFilter', () => {
  let logError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  it('answers a unique-constraint violation with 409 instead of 500', () => {
    const sent = respondTo(prismaError('P2002'));
    expect(sent.status).toBe(409);
    expect(sent.body.error.code).toBe('DUPLICATE_ENTRY');
  });

  it('answers a missing record with 404', () => {
    const sent = respondTo(prismaError('P2025'));
    expect(sent.status).toBe(404);
    expect(sent.body.error.code).toBe('RECORD_NOT_FOUND');
  });

  it('hides the details of unexpected errors and logs them', () => {
    const sent = respondTo(new Error('secret connection string'));
    expect(sent.status).toBe(500);
    expect(sent.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: 'req-1',
    });
    expect(logError).toHaveBeenCalled();
  });

  it('treats an unmapped database error as unexpected', () => {
    expect(respondTo(prismaError('P1001')).status).toBe(500);
  });
});
