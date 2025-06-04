import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { createServerSupabaseClient } from '../../../../utils/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { getPlanLimits } from '../../../../utils/planLimits';

// Create a Supabase admin client with service role key for bypassing RLS
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

// GET handler for retrieving message templates
export async function GET(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const url = new URL(req.url);
    const templateId = url.searchParams.get('id');

    // If templateId is provided, get a specific template
    if (templateId) {
      const { data, error } = await supabaseAdmin
        .from('message_templates')
        .select('*')
        .eq('id', templateId)
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error retrieving message template:', error);
        return NextResponse.json(
          { error: `Database error: ${error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ template: data });
    }

    // Otherwise, get all templates for the user
    const { data, error } = await supabaseAdmin
      .from('message_templates')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Error retrieving message templates:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ templates: data });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// POST handler for creating a new message template
export async function POST(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the request body
    const { name, content, ai_prompt } = await req.json();

    // Validate the required fields
    if (!name || !content) {
      return NextResponse.json(
        { error: 'Name and content are required' },
        { status: 400 }
      );
    }

    // First, check if the user exists in the users table
    const { data: existingUser, error: userCheckError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    // If user doesn't exist in Supabase yet, create them
    if (!existingUser) {
      console.log(`User ${userId} not found in users table, creating...`);

      const { error: createUserError } = await supabaseAdmin
        .from('users')
        .insert([
          {
            id: userId,
            user_id: userId, // Set both id and user_id to the Clerk userId
            subscription_status: 'free',
            message_count: 0,
            created_at: new Date().toISOString(),
          },
        ]);

      if (createUserError) {
        console.error('Error creating user in Supabase:', createUserError);
        return NextResponse.json(
          { error: `Failed to create user: ${createUserError.message}` },
          { status: 500 }
        );
      }
    }

    // ---- PLAN LIMIT CHECK ----
    const { data: userRecord } = await supabaseAdmin
      .from('users')
      .select('subscription_status')
      .eq('id', userId)
      .single();
    const plan = (userRecord?.subscription_status || 'free') as any;
    const limits = getPlanLimits(plan);

    // Count existing templates
    const { count: templateCount } = await supabaseAdmin
      .from('message_templates')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (
      limits.maxTemplates !== null &&
      (templateCount || 0) >= limits.maxTemplates
    ) {
      return NextResponse.json(
        {
          error:
            'Template limit reached for your current plan. Please upgrade your plan to create more templates.',
        },
        { status: 403 }
      );
    }

    // Now insert the message template
    const { data, error } = await supabaseAdmin
      .from('message_templates')
      .insert([
        {
          user_id: userId,
          name,
          content,
          ai_prompt: ai_prompt || null,
        },
      ])
      .select();

    if (error) {
      console.error('Error saving message template:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// PUT handler for updating an existing template
export async function PUT(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the request body
    const { id, name, content, ai_prompt } = await req.json();

    // Validate the required fields
    if (!id || !name || !content) {
      return NextResponse.json(
        { error: 'Template ID, name, and content are required' },
        { status: 400 }
      );
    }

    // First check if the template exists and belongs to this user
    const { data: existingTemplate, error: checkError } = await supabaseAdmin
      .from('message_templates')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (checkError || !existingTemplate) {
      return NextResponse.json(
        {
          error: 'Template not found or you do not have permission to edit it',
        },
        { status: 404 }
      );
    }

    // Update the template
    const { data, error } = await supabaseAdmin
      .from('message_templates')
      .update({
        name,
        content,
        ai_prompt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('Error updating template:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, template: data[0] });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// DELETE handler for removing a template
export async function DELETE(req: Request) {
  try {
    // Verify authentication with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const url = new URL(req.url);
    const templateId = url.searchParams.get('id');

    if (!templateId) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      );
    }

    // First check if the template exists and belongs to this user
    const { data: existingTemplate, error: checkError } = await supabaseAdmin
      .from('message_templates')
      .select('id')
      .eq('id', templateId)
      .eq('user_id', userId)
      .single();

    if (checkError || !existingTemplate) {
      return NextResponse.json(
        {
          error:
            'Template not found or you do not have permission to delete it',
        },
        { status: 404 }
      );
    }

    // Delete the template
    const { error } = await supabaseAdmin
      .from('message_templates')
      .delete()
      .eq('id', templateId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting template:', error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: `Server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
