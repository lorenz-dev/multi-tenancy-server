import { defineConfig } from 'drizzle-kit'
import * as dotenv from 'dotenv'

dotenv.config({
  path: '.env.test',
  override: true
})

export default defineConfig({
    dialect: 'postgresql',
    schema: './src/drizzle/schema.ts',
    out: './src/drizzle/',
    dbCredentials: {
        url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/claims_db',
    },
})
