import { NextResponse } from 'next/server';
import { requireRole, AuthError } from '@/lib/auth';
import { reconcileMaterials, MaterialError } from '@/lib/services/materials';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireRole(request, 'admin');
    const result = await reconcileMaterials();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof MaterialError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[MATERIAL_RECONCILE_ERROR]', error);
    return NextResponse.json({ error: 'Failed to run material reconciliation audit.' }, { status: 500 });
  }
}
