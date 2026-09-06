// netlify/functions/founder-guide.js
//
// Ria — Recircle's Founder Guide AI. Two jobs, always both available:
//   1) A supportive, warm listener a student can vent to, using general,
//      evidence-informed wellbeing/motivation coaching (sleep, light,
//      movement, stress-reset breathing, small-wins momentum) — framed as
//      coaching, never as therapy, diagnosis, or a claim to prevent crises.
//   2) An interactive co-founder-matching guide that asks sharp, concrete
//      questions about mission, commitment, complementary skills, working
//      style, and a small trial project — then helps draft a real team post.
//
// Zero npm dependencies on purpose: everything below uses the built-in
// `fetch` available in Netlify's Node 18+ runtime, so this deploys with a
// plain drag-and-drop — no package.json, no node_modules, no build step.
//
// Required environment variables (Netlify → Site configuration → Environment variables):
//   OPENAI_API_KEY               secret — never put this in index.html
//   OPENAI_MODEL                 optional, defaults to "gpt-5-mini" below.
//                                 Check platform.openai.com/docs/models for
//                                 whatever your account currently has access to.
//   SUPABASE_URL                 same project URL Recircle already uses
//   SUPABASE_ANON_KEY             same public anon key Recircle already uses
//   SUPABASE_SERVICE_ROLE_KEY    server-only — used ONLY to file a private
//                                 safety-review case after a serious risk
//                                 signal. Never expose this key to the browser.

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const MAX_MESSAGES = 8;

// Best-effort per-user rate limit. Serverless instances are ephemeral and
// can run in parallel, so this is a helpful backstop, not a hard guarantee —
// if you need a strict limit, it would need a small table in Supabase.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const rateLimitMemory = new Map();

function checkRateLimit(userId){
  const now = Date.now();
  const hits = (rateLimitMemory.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitMemory.set(userId, hits);
  return hits.length <= RATE_LIMIT_MAX;
}

// A backstop check independent of what the model itself decides — mirrors
// the client-side keyword check in index.html. Two categories, since the
// admin queue's `category` field distinguishes them.
function localRisk(text){
  const t = (text||'');
  if(/\b(suicid(e|al)|kill myself|end my life|want to die|don'?t want to live|hurt myself|self[- ]?harm|cut myself|overdose)\b/i.test(t)){
    const urgent = /\b(tonight|right now|today|going to|about to|have (a )?(plan|pills|rope|knife))\b/i.test(t);
    return { risk:true, urgent, category:'self-harm-risk' };
  }
  if(/\b(kill|hurt|attack|shoot)\s+(him|her|them|someone|everyone)\b/i.test(t)){
    return { risk:true, urgent:true, category:'harm-to-others-risk' };
  }
  return { risk:false, urgent:false, category:null };
}

function buildSystemPrompt(ctx){
  const p = ctx.profile || {};
  const teamsList = (ctx.teams||[]).map(t=>`- "${t.title}" (${t.type}): needs ${(t.skillsNeeded||[]).join(', ')||'various skills'}`).join('\n') || 'None currently open.';
  const candidatesList = (ctx.candidates||[]).map(c=>`- @${c.username}: interests [${(c.interests||[]).join(', ')}], skills [${(c.skills||[]).join(', ')}], looking for [${(c.lookingFor||[]).join(', ')}]`).join('\n') || 'None visible yet.';
  const briefLines = ctx.cofounderBrief && Object.keys(ctx.cofounderBrief).length
    ? Object.entries(ctx.cofounderBrief).map(([k,v])=>`- ${k}: ${v}`).join('\n')
    : 'Not completed yet.';

  return `You are Ria, the in-app guide for Recircle, a private student network at a college campus.

You have exactly two jobs, and you move fluidly between them based on what the student needs in the moment:

JOB 1 — SUPPORTIVE FRIEND
Be warm, direct, and genuinely present. A student may vent about stress, loneliness, a hard week, or feeling stuck. Respond like a grounded, caring friend, not a clinical assistant. Where it fits naturally, you may draw on well-established, general wellbeing and motivation science — consistent sleep and wake times, morning sunlight exposure, movement/exercise, brief stress-reset breathing (e.g. slow exhales), and building momentum through small, concrete wins rather than chasing big rewards. Offer this as practical, evidence-informed coaching in your own words — never claim to be quoting or channeling any specific named person, and never present it as medical or psychological treatment.
You are NOT a therapist, psychologist, or crisis service, and you must never claim otherwise or claim you can guarantee someone's safety. For everyday stress this is fine to navigate together. For anything resembling a real mental-health crisis or ongoing struggle, gently and clearly encourage the student to talk to a real person — a counselor, doctor, trusted friend, or family member — in addition to anything you say.

JOB 2 — CO-FOUNDER & TEAM-BUILDING GUIDE
Help the student find the right collaborators and actually start building. Ask sharp, concrete follow-up questions — not generic ones — about: the specific problem and who has it, how much time they can realistically commit, what they're strong at, what complementary skills/roles they still need, how they make decisions and handle disagreement, and what small low-stakes project could test a partnership before any big commitment. Reference the actual people and open teams below by name when relevant — be specific, not generic. When the student has enough clarity (a real problem, a rough commitment level, and a sense of what skills they need), proactively offer to help them post it as a team, and include a "teamDraft" in your JSON output (see format below) with a concrete title, a 1-2 sentence description including a first small milestone, and a skillsNeeded list drawn only from this exact set: Python, JavaScript, Java, C++, Arduino, Electronics, UI/UX, AI/ML, Public Speaking, Video Editing, Marketing, 3D Design, Embedded Systems, Data Analysis.

CONTEXT YOU HAVE ACCESS TO (use it concretely, don't ignore it):
Student's profile — interests: [${(p.interests||[]).join(', ')}], skills: [${(p.skills||[]).join(', ')}], looking for: [${(p.lookingFor||[]).join(', ')}], goals: "${p.goals||''}"

Visible potential collaborators:
${candidatesList}

Currently open teams on Recircle:
${teamsList}

Co-founder interview answers so far (if any):
${briefLines}

SAFETY — READ CAREFULLY
If the student's message expresses intent or serious risk of suicide, self-harm, or harming someone else, do not try to talk them out of it yourself or attempt to fully handle it in conversation. Respond briefly and warmly, encourage them to use real, immediate help right now, and set "crisis": true. Do not minimize, do not diagnose, do not promise confidentiality, and do not delay past one short reply before flagging it.

RESPONSE FORMAT — respond with STRICT JSON only, no other text, in exactly this shape:
{"reply": "your response as plain text, 2-5 sentences, one question at a time when asking something", "crisis": true or false, "teamDraft": null or {"title": "...", "description": "...", "skillsNeeded": ["..."], "size": 4}}`;
}

async function verifySupabaseUser(token){
  const url = `${process.env.SUPABASE_URL}/auth/v1/user`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': process.env.SUPABASE_ANON_KEY }
  });
  if(!res.ok) return null;
  const data = await res.json();
  return data && data.id ? data : null;
}

async function fileSafetyFlag({ userId, riskLevel, category, excerpt }){
  try{
    const url = `${process.env.SUPABASE_URL}/rest/v1/ai_safety_flags`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        user_id: userId,
        risk_level: riskLevel,
        category,
        excerpt: (excerpt||'').slice(0, 400),
        status: 'open'
      })
    });
  }catch(e){
    console.error('Failed to file safety flag (non-fatal to the chat reply):', e);
  }
}

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if(!token){
    return { statusCode: 401, body: JSON.stringify({ error: 'Sign in required.' }) };
  }

  let user;
  try{ user = await verifySupabaseUser(token); }
  catch(e){ return { statusCode: 500, body: JSON.stringify({ error: 'Could not verify session.' }) }; }
  if(!user){
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session.' }) };
  }

  if(!checkRateLimit(user.id)){
    return { statusCode: 429, body: JSON.stringify({ error: 'You are sending messages a little fast — please slow down.' }) };
  }

  let ctx;
  try{ ctx = JSON.parse(event.body || '{}'); }
  catch(e){ return { statusCode: 400, body: JSON.stringify({ error: 'Malformed request.' }) }; }

  const messages = Array.isArray(ctx.messages) ? ctx.messages.slice(-MAX_MESSAGES) : [];
  const lastUserMessage = [...messages].reverse().find(m=>m.role==='user');
  const backstop = localRisk(lastUserMessage ? lastUserMessage.content : '');

  if(!process.env.OPENAI_API_KEY){
    return { statusCode: 200, body: JSON.stringify({ reply: null, crisis: backstop.risk }) };
  }

  let modelOutput = null;
  try{
    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        store: false,
        messages: [
          { role: 'system', content: buildSystemPrompt(ctx) },
          ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content||'').slice(0, 2000) }))
        ]
      })
    });
    if(completion.ok){
      const data = await completion.json();
      const raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if(raw){
        try{ modelOutput = JSON.parse(raw); }catch(e){ modelOutput = null; }
      }
    } else {
      console.error('OpenAI request failed:', completion.status, await completion.text().catch(()=>'')); 
    }
  }catch(e){
    console.error('OpenAI request errored:', e);
  }

  const crisis = Boolean((modelOutput && modelOutput.crisis) || backstop.risk);

  if(crisis){
    await fileSafetyFlag({
      userId: user.id,
      riskLevel: backstop.urgent ? 'urgent' : 'high',
      category: backstop.category || 'self-harm-risk',
      excerpt: lastUserMessage ? lastUserMessage.content : ''
    });
  }

  const reply = (modelOutput && typeof modelOutput.reply === 'string' && modelOutput.reply.trim())
    ? modelOutput.reply.trim()
    : null;
  const teamDraft = (modelOutput && modelOutput.teamDraft && typeof modelOutput.teamDraft === 'object') ? modelOutput.teamDraft : null;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reply, crisis, teamDraft })
  };
};
