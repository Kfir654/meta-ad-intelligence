import { NextFunction, Request, Response } from 'express';

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

const errorHandler = (err: HttpError, _req: Request, res: Response, _next: NextFunction): void => {
  console.error(`[Error] ${err.message}`);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Something went wrong on the server. Please try again.',
  });
};

export default errorHandler;
