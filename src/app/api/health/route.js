import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const [rows] = await pool.query('SELECT 1 AS alive');
    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      ping: rows[0]?.alive === 1,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'disconnected',
        message: 'Could not connect to MySQL. Ensure MySQL is running and credentials in .env are correct.',
        error: error.message,
      },
      { status: 503 }
    );
  }
}
