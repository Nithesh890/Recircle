// netlify/functions/cofounder-match-scan.mjs
//
// Runs automatically on a schedule (see `config` at the bottom) — this is
// what makes co-founder matching "background/automatic" rather than only
// happening when someone happens to open the app.
//
// What it does NOT do: it never creates a "like" or a mutual match on
// anyone's behalf. Matching still requires two real people to each tap
// "Interested" — that consent step is the whole point of the Tinder-style
// design. This job only finds and SUGGESTS strong candidates, notifying a
// student when someone genuinely new and promising shows up on the board.
//
// Zero npm dependencies (uses built-in fetch), and uses the modern Netlify
// scheduled-function format (ESM + `export const config`), so it needs no
// package.json / node_modules — same drag-and-drop deploy as your other
// function.
//
// Required environment variables (already set from the Founder Guide setup):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const REST = process.env.SUPABASE_URL + '/rest/v1';
const HEADERS = {
  'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json'
};

async function supaGet(path){
  const res = await fetch(`${REST}${path}`, { headers: HEADERS });
  if(!res.ok) throw new Error(`Supabase GET ${path} failed: ${res.status} ${await res.text().catch(()=> '')}`);
  return res.json();
}
async function supaPatch(path, body){
  const res = await fetch(`${REST}${path}`, { method:'PATCH', headers: { ...HEADERS, 'Prefer':'return=minimal' }, body: JSON.stringify(body) });
  if(!res.ok) console.error(`Supabase PATCH ${path} failed:`, res.status, await res.text().catch(()=> ''));
}
async function supaInsert(path, rows){
  const res = await fetch(`${REST}${path}`, { method:'POST', headers: { ...HEADERS, 'Prefer':'return=minimal' }, body: JSON.stringify(rows) });
  if(!res.ok) console.error(`Supabase INSERT ${path} failed:`, res.status, await res.text().catch(()=> ''));
}

function words(s){ return (s||'').toLowerCase().match(/[a-z]{4,}/g) || []; }
function overlapCount(a, b){
  const setA = new Set(words(a));
  return words(b).filter(w => setA.has(w)).length;
}
function compatibility(mine, other, mineChips, otherChips){
  let score = 0; let reason = '';
  const skillHit = overlapCount(mine.needed_skills, other.strengths);
  if(skillHit){ score += skillHit*6; reason = `brings what you said you need`; }
  const skillHitReverse = overlapCount(other.needed_skills, mine.strengths);
  if(skillHitReverse){ score += skillHitReverse*6; if(!reason) reason = `you bring what they're looking for`; }
  const problemOverlap = overlapCount(mine.problem, other.problem);
  if(problemOverlap){ score += problemOverlap*3; if(!reason) reason = 'working on a related problem'; }
  score += (mineChips.interests||[]).filter(x=>(otherChips.interests||[]).includes(x)).length * 2;
  score += (otherChips.skills||[]).filter(x=>!(mineChips.skills||[]).includes(x)).length;
  return { score, reason: reason || 'compatible goals and skills' };
}

const MATCH_SUGGEST_THRESHOLD = 8;
const TOP_N = 5;

export default async () => {
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY){
    console.error('Missing Supabase service credentials — skipping scan.');
    return new Response('Missing config', { status: 200 });
  }

  const [looking, profiles] = await Promise.all([
    supaGet('/cofounder_profiles?looking=eq.true&select=*'),
    supaGet('/profiles?select=id,username,interests,skills')
  ]);

  const profileById = {};
  profiles.forEach(p => profileById[p.id] = p);

  let notifiedCount = 0;

  for(const mine of looking){
    const mineChips = profileById[mine.user_id] || {};
    const ranked = looking
      .filter(o => o.user_id !== mine.user_id)
      .map(o => ({ other: o, ...compatibility(mine, o, mineChips, profileById[o.user_id]||{}) }))
      .sort((a,b) => b.score - a.score)
      .slice(0, TOP_N)
      .filter(m => m.score >= MATCH_SUGGEST_THRESHOLD);

    const currentTopUsernames = ranked.map(m => (profileById[m.other.user_id]||{}).username).filter(Boolean);
    const previouslyNotified = new Set(mine.last_notified_matches || []);
    const newOnes = ranked.filter(m => {
      const uname = (profileById[m.other.user_id]||{}).username;
      return uname && !previouslyNotified.has(uname);
    });

    if(newOnes.length){
      const names = newOnes.map(m => `@${(profileById[m.other.user_id]||{}).username}`).join(', ');
      const body = newOnes.length === 1
        ? `🚀 Ria found a new potential co-founder match: ${names} — ${newOnes[0].reason}. Check your Co-Founders dashboard.`
        : `🚀 Ria found ${newOnes.length} new potential co-founder matches: ${names}. Check your Co-Founders dashboard.`;
      await supaInsert('/notifications', [{ user_id: mine.user_id, type: 'cofounder_suggestion', body }]);
      await supaPatch(`/cofounder_profiles?user_id=eq.${mine.user_id}`, { last_notified_matches: currentTopUsernames });
      notifiedCount++;
    }
  }

  return new Response(JSON.stringify({ scanned: looking.length, notified: notifiedCount }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

// Runs every 6 hours. Change the cron expression to adjust frequency —
// e.g. "@daily" for once a day, "0 */2 * * *" for every 2 hours.
export const config = {
  schedule: '0 */6 * * *'
};
