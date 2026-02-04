/**
 * Database Migration Endpoint
 * POST /api/migrate - Run pending migrations
 * GET /api/migrate - Check migration status
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import * as fs from 'fs';
import * as path from 'path';

// Verify API key
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validKey = process.env.API_KEY || process.env.SIMON_API_KEY;
  return apiKey === validKey;
}

// Get all migration files sorted by name
function getMigrationFiles(): string[] {
  const migrationsDir = path.join(process.cwd(), 'src/lib/migrations');
  
  try {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    return files.map(f => path.join(migrationsDir, f));
  } catch (error) {
    console.error('Error reading migrations directory:', error);
    return [];
  }
}

// Create migrations tracking table if it doesn't exist
async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

// Get applied migrations
async function getAppliedMigrations(): Promise<string[]> {
  const result = await pool.query('SELECT name FROM _migrations ORDER BY name');
  return result.rows.map(r => r.name);
}

// Apply a migration
async function applyMigration(filePath: string): Promise<void> {
  const name = path.basename(filePath);
  const sql = fs.readFileSync(filePath, 'utf-8');
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
    await client.query('COMMIT');
    console.log(`Applied migration: ${name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// POST /api/migrate - Run pending migrations
export async function POST(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureMigrationsTable();
    
    const applied = await getAppliedMigrations();
    const files = getMigrationFiles();
    const pending = files.filter(f => !applied.includes(path.basename(f)));
    
    if (pending.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending migrations',
        applied: applied.length,
        pending: 0
      });
    }

    const results: string[] = [];
    const errors: string[] = [];

    for (const file of pending) {
      try {
        await applyMigration(file);
        results.push(path.basename(file));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${path.basename(file)}: ${msg}`);
        // Stop on first error
        break;
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      applied: results,
      errors: errors.length > 0 ? errors : undefined,
      message: errors.length > 0 
        ? `Applied ${results.length} migrations, ${errors.length} failed`
        : `Applied ${results.length} migrations`
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Migration failed' },
      { status: 500 }
    );
  }
}

// GET /api/migrate - Check migration status
export async function GET(request: NextRequest) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureMigrationsTable();
    
    const applied = await getAppliedMigrations();
    const files = getMigrationFiles();
    const pending = files.filter(f => !applied.includes(path.basename(f)));

    return NextResponse.json({
      applied: applied,
      pending: pending.map(f => path.basename(f)),
      total: files.length
    });

  } catch (error) {
    console.error('Migration status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get migration status' },
      { status: 500 }
    );
  }
}
