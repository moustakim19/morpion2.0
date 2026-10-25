/* =========================================================
   config.js — Tes clés Supabase
   ---------------------------------------------------------
   1. Va sur supabase.com → ton projet → Project Settings → API
   2. Copie la « Project URL » et la clé « anon public »
   3. Remplace les XXXX ci-dessous (garde les guillemets !)

   La clé « anon » est faite pour être dans le navigateur :
   la sécurité vient des règles RLS de la base (voir supabase.sql).
   Garde quand même ton dépôt GitHub en privé.
   ========================================================= */
window.MORPION_CONFIG = {
  SUPABASE_URL: "XXXX",       // exemple : "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: "XXXX",  // exemple : "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
};
