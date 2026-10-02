/* ==========================================================
   Run Detroit — accounts and progress sync (Supabase)
   Exposes window.RD. Degrades to local-only if unreachable.
   ========================================================== */
(() => {
"use strict";

const cfg = window.RD_CONFIG || {};
let client = null, ready = false;

try{
  if(window.supabase && cfg.supabaseUrl && cfg.supabaseKey){
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:false, storageKey:"run-detroit-auth" }
    });
    ready = true;
  }
}catch(e){ console.warn("Supabase unavailable:", e); }

const listeners = new Set();
const emit = (user) => listeners.forEach(fn => { try{ fn(user); }catch(e){} });

if(client){
  client.auth.onAuthStateChange((_evt, session) => emit(session?.user || null));
}

/* state <-> row mapping */
const toRow = (s) => ({
  points: s.points, streak: s.streak, weeks_active: s.weeksActive,
  checked_in_court: s.checkedInCourt, shots_fired: !!s.shotsFired,
  submitted: !!s.submitted, stops: s.stops
});
const fromRow = (r) => ({
  points: r.points, streak: r.streak, weeksActive: r.weeks_active,
  checkedIn: !!r.checked_in_court, checkedInCourt: r.checked_in_court,
  shotsFired: !!r.shots_fired, submitted: !!r.submitted,
  stops: Array.isArray(r.stops) ? r.stops : [true,false,false]
});

const RD = {
  get enabled(){ return ready; },

  onAuth(fn){ listeners.add(fn); return () => listeners.delete(fn); },

  async currentUser(){
    if(!client) return null;
    const { data } = await client.auth.getSession();
    return data?.session?.user || null;
  },

  async signInGuest(){
    if(!client) throw new Error("offline");
    const { data, error } = await client.auth.signInAnonymously();
    if(error) throw error;
    return data.user;
  },

  async sendCode(email){
    if(!client) throw new Error("offline");
    const { error } = await client.auth.signInWithOtp({
      email, options:{ shouldCreateUser:true }
    });
    if(error) throw error;
  },

  async verifyCode(email, token){
    if(!client) throw new Error("offline");
    const { data, error } = await client.auth.verifyOtp({ email, token, type:"email" });
    if(error) throw error;
    return data.user;
  },

  /* Turn a guest account into a permanent one, keeping all progress. */
  async linkEmail(email){
    if(!client) throw new Error("offline");
    const { error } = await client.auth.updateUser({ email });
    if(error) throw error;
  },

  async signOut(){ if(client) await client.auth.signOut(); },

  async loadState(){
    if(!client) return null;
    const user = await RD.currentUser();
    if(!user) return null;
    const { data, error } = await client
      .from("player_state").select("*").eq("user_id", user.id).maybeSingle();
    if(error){ console.warn("loadState", error.message); return null; }
    if(!data){
      const { data: made } = await client
        .from("player_state").insert({ user_id:user.id }).select().maybeSingle();
      return made ? fromRow(made) : null;
    }
    return fromRow(data);
  },

  async saveState(s){
    if(!client) return;
    const user = await RD.currentUser();
    if(!user) return;
    const { error } = await client
      .from("player_state")
      .upsert({ user_id:user.id, ...toRow(s) }, { onConflict:"user_id" });
    if(error) console.warn("saveState", error.message);
  },

  async logEvent(courtId, points, kind){
    if(!client) return;
    const user = await RD.currentUser();
    if(!user) return;
    await client.from("check_ins")
      .insert({ user_id:user.id, court_id:courtId, points:points|0, kind:kind || "check_in" });
  },

  async profile(){
    if(!client) return null;
    const user = await RD.currentUser();
    if(!user) return null;
    const { data } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
    return data || null;
  },

  async setDisplayName(name){
    if(!client) return;
    const user = await RD.currentUser();
    if(!user) return;
    await client.from("profiles").update({ display_name:name }).eq("id", user.id);
  },

  async activity(limit = 8){
    if(!client) return [];
    const user = await RD.currentUser();
    if(!user) return [];
    const { data } = await client.from("check_ins")
      .select("court_id,points,kind,created_at")
      .eq("user_id", user.id).order("created_at",{ascending:false}).limit(limit);
    return data || [];
  }
};

window.RD = RD;
})();
