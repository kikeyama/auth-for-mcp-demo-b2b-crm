import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  database: {
    connectionString: process.env.DATABASE_URL ?? '',
  },
  auth0: {
    issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL ?? '',
    audience: process.env.AUTH0_AUDIENCE ?? '',
  },
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(','),
};
