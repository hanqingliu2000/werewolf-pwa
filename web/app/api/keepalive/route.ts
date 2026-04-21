import { NextResponse } from 'next/server';
import { getSupabaseClient, persistenceMode } from '@/lib/repo';

export async function GET() {
  try {
    const mode = persistenceMode();
    if (mode === 'supabase') {
      const sb = getSupabaseClient();
      const { error } = await sb!.from('rooms').select('id').limit(1);
      if (error) throw new Error(`SUPABASE_KEEPALIVE_FAILED: ${error.message}`);
    }

    return NextResponse.json(
      {
        ok: true,
        mode,
        ts: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'cache-control': 'no-store',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: (error as Error).message || 'UNKNOWN_ERROR',
        ts: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
