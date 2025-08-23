import { NextResponse } from 'next/server';

const BENO_AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb2xsZWN0aW9uSWQiOiJtaTJ4bm5oYjkyNWpmNGYiLCJleHAiOjE4MTkwMzM1MTksImlkIjoiaDIxdGRmM25oazg2d3dvIiwidHlwZSI6ImF1dGhSZWNvcmQifQ.e2Wz4BnFXi8VJm7RcTkoyq74Du-gpHaFZ72xdWz9TZk';
const PB_BASE = 'https://app.beno.one/pbsb/api';

// GET /api/beno/ready-replies?productId=<id>
// Fetches ready-to-post replies from Beno
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');
    
    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    // Filter for validated replies ready to post
    const filter = encodeURIComponent(
      `product="${productId}" && status!="hidden" && (status="submitted" || status="validation_passed_manual_awaiting" || status="validation_passed")`
    );
    
    const url = `${PB_BASE}/collections/beno_replies/records?filter=${filter}&expand=reply_to,posted_by,reply_to.subs_source&sort=-created&perPage=20`;
    
    const res = await fetch(url, {
      headers: {
        'Authorization': BENO_AUTH_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ 
        error: `Beno API error ${res.status}: ${err.slice(0, 200)}` 
      }, { status: res.status });
    }

    const data = await res.json();
    
    // Transform data for easier consumption
    const replies = data.items?.map((item: any) => ({
      id: item.id,
      text: item.text,
      relevanceScore: item.relevance_score,
      validationScore: item.validation_score,
      status: item.status,
      post: {
        id: item.expand?.reply_to?.id,
        title: item.expand?.reply_to?.post_title,
        body: item.expand?.reply_to?.post_body,
        link: item.expand?.reply_to?.link,
        redditId: item.expand?.reply_to?.on_platform_external_id,
        author: item.expand?.reply_to?.author_username,
        subreddit: item.expand?.reply_to?.subs_source ? {
          name: item.expand.reply_to.subs_source.topic,
          description: item.expand.reply_to.subs_source.description,
          followers: item.expand.reply_to.subs_source.followers_count
        } : null
      }
    })) || [];

    return NextResponse.json({
      success: true,
      totalItems: data.totalItems || 0,
      replies
    });

  } catch (error) {
    console.error('[ready-replies] Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// PATCH /api/beno/ready-replies/<replyId>
// Updates reply status after posting
export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const replyId = searchParams.get('replyId');
    const body = await req.json();
    
    if (!replyId) {
      return NextResponse.json({ error: 'replyId is required' }, { status: 400 });
    }

    const url = `${PB_BASE}/collections/beno_replies/records/${replyId}`;
    
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': BENO_AUTH_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ 
        error: `Beno API error ${res.status}: ${err.slice(0, 200)}` 
      }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('[ready-replies] PATCH Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
