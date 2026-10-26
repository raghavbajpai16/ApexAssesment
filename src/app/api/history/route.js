import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getUnifiedHistory, exportHistoryToCSV } from '@/lib/services/history';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'all';
    const search = searchParams.get('search') || '';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit'), 10) : 100;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset'), 10) : 0;
    const format = searchParams.get('format') || 'json';

    // If requesting CSV export, retrieve full filtered set (up to 500 records)
    const exportLimit = format === 'csv' ? 500 : limit;
    const result = await getUnifiedHistory({
      category,
      search,
      limit: exportLimit,
      offset,
    });

    if (format === 'csv') {
      const csv = exportHistoryToCSV(result.events);
      const filename = `apex_audit_history_${new Date().toISOString().slice(0, 10)}.csv`;

      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error.status === 401) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('[GET /api/history] Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve unified audit history' }, { status: 500 });
  }
}
