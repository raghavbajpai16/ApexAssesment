import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth';
import { getSpecById, updateSpec, SpecError } from '@/lib/services/specs';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    await requireUser(request);
    const spec = await getSpecById(params.id);
    return NextResponse.json({ spec }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SpecError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[SPEC_GET_ID_ERROR]', error);
    return NextResponse.json({ error: 'Failed to retrieve specification.' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    await requireUser(request);
    const body = await request.json();
    const updated = await updateSpec(params.id, body);
    return NextResponse.json({ spec: updated }, { status: 200 });
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
    console.error('[SPEC_PUT_ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update specification.' },
      { status: 500 }
    );
  }
}
