import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function GET() {
  try {
    // Delete archived logs older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    // First get the archived logs to delete (to get file paths)
    const { data: expiredArchives, error: fetchError } = await supabaseAdmin
      .from('archived_logs')
      .select('id, file_path')
      .lt('created_at', oneHourAgo);

    if (fetchError) {
      console.error('Error fetching expired archives:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch expired archives' }, { status: 500 });
    }

    if (!expiredArchives || expiredArchives.length === 0) {
      return NextResponse.json({ message: 'No expired archives to delete' });
    }

    // Delete files from storage
    const filePaths = expiredArchives.map(archive => archive.file_path);
    const { error: storageError } = await supabaseAdmin.storage
      .from('logs')
      .remove(filePaths);

    if (storageError) {
      console.error('Error deleting files from storage:', storageError);
      // Continue with DB cleanup even if file deletion fails
    }

    // Delete records from database
    const archiveIds = expiredArchives.map(archive => archive.id);
    const { error: deleteError } = await supabaseAdmin
      .from('archived_logs')
      .delete()
      .in('id', archiveIds);

    if (deleteError) {
      console.error('Error deleting archive records:', deleteError);
      return NextResponse.json({ error: 'Failed to delete archive records' }, { status: 500 });
    }

    console.log(`Cleaned up ${expiredArchives.length} expired archive logs`);
    
    return NextResponse.json({ 
      message: `Successfully deleted ${expiredArchives.length} expired archive logs`,
      deletedCount: expiredArchives.length
    });

  } catch (error) {
    console.error('Error in cleanup-archives cron:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
