import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth';
import { getMaterialInventory, MaterialError } from '@/lib/services/materials';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireUser(request);
    const materials = await getMaterialInventory();
    return NextResponse.json({ materials }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof MaterialError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[MATERIALS_GET_ERROR]', error);
    return NextResponse.json({ error: 'Failed to retrieve material inventory.' }, { status: 500 });
  }
}
