import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth';
import { getSpecs, createSpec, SpecError } from '@/lib/services/specs';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireUser(request);
    const specs = await getSpecs();
    return NextResponse.json({ specs }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[SPECS_GET_ERROR]', error);
    return NextResponse.json({ error: 'Failed to retrieve specifications.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await requireUser(request);
    const body = await request.json();
    const created = await createSpec(body);
    return NextResponse.json({ spec: created }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SpecError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ZodError) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return NextResponse.json({ error: messages }, { status: 400 });
    }
    console.error('[SPECS_POST_ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create specification.' },
      { status: 500 }
    );
  }
}
