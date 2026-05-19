import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    // Normalize pathname: strip any Supabase routing prefix (/functions/v1/<fn-name>)
    // so we match clean paths like /health, /canvas/create, /canvas/:id/join etc.
    let pathname = url.pathname;
    const fnIdx = pathname.indexOf('make-server-832115ea');
    if (fnIdx >= 0) {
      pathname = pathname.substring(fnIdx + 'make-server-832115ea'.length);
    }
    if (!pathname.startsWith('/')) pathname = '/' + pathname;
    const body = req.method !== 'GET' ? await req.json().catch(() => ({})) : {};

    // GET /health
    if (req.method === 'GET' && pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // POST /canvas/create
    if (req.method === 'POST' && pathname === '/canvas/create') {
      const { name, userId, data } = body;

      if (!name || !userId) {
        return new Response(JSON.stringify({ success: false, error: 'Missing required fields: name, userId' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // Create the canvas
      const { data: canvas, error: createError } = await supabase
        .from('collaborative_canvases')
        .insert({ name, data: data || {} })
        .select()
        .single();

      if (createError || !canvas) {
        console.error('Error creating canvas:', createError);
        return new Response(JSON.stringify({ success: false, error: createError?.message || 'Failed to create canvas' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // Auto-join creator as first participant
      const { error: joinError } = await supabase
        .from('canvas_participants')
        .insert({
          canvas_id: canvas.id,
          user_id: userId,
          user_name: 'Creator',
          color: '#6366f1',
          role: 'editor',
        });

      if (joinError) {
        console.error('Error adding creator as participant:', joinError);
        // Non-fatal — canvas was created even if participant insert fails
      }

      // Broadcast creation on realtime channel
      try {
        const channel = supabase.channel(`canvas:${canvas.id}`);
        await channel.send({
          type: 'broadcast',
          event: 'canvas_update',
          payload: { data: canvas.data, updatedBy: userId },
        });
        // Clean up the channel after broadcast (we don't subscribe)
        supabase.removeChannel(channel);
      } catch (broadcastErr) {
        console.warn('Broadcast failed (non-fatal):', broadcastErr);
      }

      const shareUrl = `${url.origin}/?canvas=${canvas.id}`;

      return new Response(JSON.stringify({
        success: true,
        canvasId: canvas.id,
        shareUrl,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Extract canvas ID from path for parameterized routes
    // Match /canvas/:id/join, /canvas/:id/leave, /canvas/:id/presence, /canvas/:id
    const canvasMatch = pathname.match(/^\/canvas\/([^/]+)(\/(\w+))?$/);
    if (!canvasMatch) {
      return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    const canvasId = canvasMatch[1];
    const subResource = canvasMatch[3] || null;

    // POST /canvas/:id/join
    if (req.method === 'POST' && subResource === 'join') {
      const { userId, userName } = body;

      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: 'Missing required field: userId' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // Fetch the canvas
      const { data: canvas, error: canvasError } = await supabase
        .from('collaborative_canvases')
        .select('*')
        .eq('id', canvasId)
        .single();

      if (canvasError || !canvas) {
        return new Response(JSON.stringify({ success: false, error: 'Canvas not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      // Count existing participants
      const { count: participantCount, error: countError } = await supabase
        .from('canvas_participants')
        .select('*', { count: 'exact', head: true })
        .eq('canvas_id', canvasId);

      if (countError) {
        return new Response(JSON.stringify({ success: false, error: 'Failed to check participant count' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      if (participantCount !== null && participantCount >= canvas.max_participants) {
        return new Response(JSON.stringify({ success: false, error: 'Canvas is full' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }

      // Upsert participant (INSERT or UPDATE if re-joining)
      const { error: upsertError } = await supabase
        .from('canvas_participants')
        .upsert({
          canvas_id: canvasId,
          user_id: userId,
          user_name: userName || `User ${Date.now().toString().slice(-4)}`,
          last_seen: new Date().toISOString(),
        }, {
          onConflict: 'canvas_id, user_id',
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error('Error upserting participant:', upsertError);
        return new Response(JSON.stringify({ success: false, error: upsertError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // Fetch all participants for this canvas
      const { data: participants, error: participantsError } = await supabase
        .from('canvas_participants')
        .select('*')
        .eq('canvas_id', canvasId);

      if (participantsError) {
        console.error('Error fetching participants:', participantsError);
      }

      // Determine role (first participant is editor by default, subsequent are also editor)
      const userParticipant = participants?.find(p => p.user_id === userId);

      // Broadcast join event
      try {
        const channel = supabase.channel(`canvas:${canvasId}`);
        await channel.send({
          type: 'broadcast',
          event: 'presence_update',
          payload: {
            userId,
            presence: {
              userId,
              userName: userName || userParticipant?.user_name || 'Unknown',
              lastSeen: new Date().toISOString(),
              color: userParticipant?.color || '#6366f1',
            },
          },
        });
        supabase.removeChannel(channel);
      } catch (broadcastErr) {
        console.warn('Broadcast failed (non-fatal):', broadcastErr);
      }

      return new Response(JSON.stringify({
        success: true,
        canvas: {
          id: canvas.id,
          name: canvas.name,
          data: canvas.data,
          createdAt: canvas.created_at,
          updatedAt: canvas.updated_at,
          participants: (participants || []).map((p: any) => ({
            userId: p.user_id,
            userName: p.user_name,
            color: p.color,
            cursor: p.cursor_pos,
            lastSeen: p.last_seen,
          })),
          maxParticipants: canvas.max_participants,
        },
        role: userParticipant?.role || 'editor',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // POST /canvas/:id/leave
    if (req.method === 'POST' && subResource === 'leave') {
      const { userId } = body;

      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: 'Missing required field: userId' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const { error: deleteError } = await supabase
        .from('canvas_participants')
        .delete()
        .eq('canvas_id', canvasId)
        .eq('user_id', userId);

      if (deleteError) {
        console.error('Error removing participant:', deleteError);
      }

      // Broadcast leave event
      try {
        const channel = supabase.channel(`canvas:${canvasId}`);
        await channel.send({
          type: 'broadcast',
          event: 'user_left',
          payload: { userId },
        });
        supabase.removeChannel(channel);
      } catch (broadcastErr) {
        console.warn('Broadcast failed (non-fatal):', broadcastErr);
      }

      return new Response(JSON.stringify({}), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // PUT /canvas/:id/presence
    if (req.method === 'PUT' && subResource === 'presence') {
      const { userId, presence } = body;

      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: 'Missing required field: userId' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // Update participant's cursor and last_seen
      const updateData: any = { last_seen: new Date().toISOString() };
      if (presence?.cursor) {
        updateData.cursor_pos = presence.cursor;
      }
      if (presence?.userName) {
        updateData.user_name = presence.userName;
      }
      if (presence?.color) {
        updateData.color = presence.color;
      }

      const { error: updateError } = await supabase
        .from('canvas_participants')
        .update(updateData)
        .eq('canvas_id', canvasId)
        .eq('user_id', userId);

      if (updateError) {
        console.error('Error updating presence:', updateError);
      }

      // Broadcast presence update to channel
      try {
        const channel = supabase.channel(`canvas:${canvasId}`);
        await channel.send({
          type: 'broadcast',
          event: 'presence_update',
          payload: {
            userId,
            presence: {
              userId,
              userName: presence?.userName || 'Unknown',
              cursor: presence?.cursor || null,
              lastSeen: new Date().toISOString(),
              color: presence?.color || '#6366f1',
            },
          },
        });
        supabase.removeChannel(channel);
      } catch (broadcastErr) {
        console.warn('Broadcast failed (non-fatal):', broadcastErr);
      }

      return new Response(JSON.stringify({}), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // PUT /canvas/:id (update canvas data)
    if (req.method === 'PUT' && !subResource) {
      const { data, userId } = body;

      if (!data) {
        return new Response(JSON.stringify({ success: false, error: 'Missing required field: data' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const { error: updateError } = await supabase
        .from('collaborative_canvases')
        .update({ data, updated_at: new Date().toISOString() })
        .eq('id', canvasId);

      if (updateError) {
        console.error('Error updating canvas:', updateError);
        return new Response(JSON.stringify({ success: false, error: updateError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // Broadcast canvas_update
      try {
        const channel = supabase.channel(`canvas:${canvasId}`);
        await channel.send({
          type: 'broadcast',
          event: 'canvas_update',
          payload: { data, updatedBy: userId },
        });
        supabase.removeChannel(channel);
      } catch (broadcastErr) {
        console.warn('Broadcast failed (non-fatal):', broadcastErr);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Fallback — route not matched
    return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 404,
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
