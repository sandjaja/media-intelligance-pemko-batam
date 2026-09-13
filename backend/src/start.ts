import 'dotenv/config';

// Vercel's Neon integration can expose the PostgreSQL connection as POSTGRES_URL.
// The application internally uses DATABASE_URL, so normalize the provider variable
// once at process startup without copying or exposing the secret.
if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_URL;
}

await import('./server.js');
