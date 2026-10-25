-- =====================================================================
--  MORPION 2.0 — Base de données Supabase
--  À coller dans Supabase → SQL Editor → New query → Run
--  (tu peux le relancer sans danger : il ne crée que ce qui manque)
-- =====================================================================


-- =====================================================================
-- 1) TABLE DES JOUEURS
-- =====================================================================
create table if not exists public.players (
  id          uuid primary key references auth.users(id) on delete cascade, -- lié au compte
  pseudo      text not null check (char_length(pseudo) between 3 and 16),
  points      integer not null default 1000,   -- tout le monde commence à 1000
  victoires   integer not null default 0,
  defaites    integer not null default 0,
  created_at  timestamptz not null default now()
);
-- Pseudo unique (sans tenir compte des majuscules : « Léo » = « léo »)
create unique index if not exists players_pseudo_unique on public.players (lower(pseudo));
create index if not exists players_points_idx on public.players (points desc);


-- =====================================================================
-- 2) TABLE DES PARTIES
-- =====================================================================
create table if not exists public.games (
  id            uuid primary key default gen_random_uuid(),
  code          text,                                   -- code de salle (4 caractères)
  joueur1       uuid references public.players(id) on delete set null, -- joue les X, commence
  joueur2       uuid references public.players(id) on delete set null, -- joue les O
  grille        text not null default repeat('0', 16),  -- 16 caractères : 0 vide, 1 = X, 2 = O
  tour          smallint not null default 1 check (tour in (1, 2)), -- à qui le tour
  gagnant       smallint check (gagnant in (0, 1, 2)),  -- 0 = match nul
  statut        text not null default 'attente'
                check (statut in ('attente', 'en_cours', 'terminee', 'annulee')),
  rapide        boolean not null default false,         -- vient de la « partie rapide » ?
  dernier_coup  smallint,                               -- dernière case jouée
  coup_at       timestamptz not null default now(),     -- début du tour (chronomètre)
  vu_j1         timestamptz not null default now(),     -- dernier signe de vie du joueur 1
  vu_j2         timestamptz,                            -- dernier signe de vie du joueur 2
  fin_raison    text,                                   -- alignement, nul, abandon, forfait
  elo_j1        integer,                                -- points gagnés/perdus
  elo_j2        integer,
  revanche_j1   boolean not null default false,
  revanche_j2   boolean not null default false,
  revanche_id   uuid,                                   -- la partie de revanche
  version       integer not null default 0,             -- +1 à chaque modification
  created_at    timestamptz not null default now()      -- date
);
-- Un code ne peut servir qu'à une seule partie active à la fois
create unique index if not exists games_code_actif on public.games (code)
  where statut in ('attente', 'en_cours');
create index if not exists games_file_rapide on public.games (created_at)
  where rapide and statut = 'attente';

-- Passage à la grille 4 × 4 :
-- les nouvelles parties ont 16 cases, et les anciennes parties pas finies sont annulées
alter table public.games alter column grille set default repeat('0', 16);
update public.games set statut = 'annulee', version = version + 1
  where char_length(grille) <> 16 and statut in ('attente', 'en_cours');


-- =====================================================================
-- 3) SÉCURITÉ : RLS (Row Level Security = règles ligne par ligne)
-- =====================================================================
alter table public.players enable row level security;
alter table public.games   enable row level security;

-- Tout le monde peut voir le classement
drop policy if exists "Tout le monde voit le classement" on public.players;
create policy "Tout le monde voit le classement"
  on public.players for select using (true);

-- Seuls les 2 joueurs d'une partie peuvent la voir…
drop policy if exists "Les 2 joueurs voient leur partie" on public.games;
create policy "Les 2 joueurs voient leur partie"
  on public.games for select to authenticated
  using (auth.uid() in (joueur1, joueur2));

-- … et la modifier
drop policy if exists "Seuls les 2 joueurs modifient leur partie" on public.games;
create policy "Seuls les 2 joueurs modifient leur partie"
  on public.games for update to authenticated
  using (auth.uid() in (joueur1, joueur2))
  with check (auth.uid() in (joueur1, joueur2));

-- DOUBLE SÉCURITÉ : on retire le droit d'écrire DIRECTEMENT dans les tables.
-- Sinon un tricheur pourrait écrire « gagnant = moi » ou « points = 99999 ».
-- Toutes les modifications passent par les fonctions ci-dessous, qui vérifient
-- que tu es l'un des 2 joueurs ET que le coup respecte les règles.
revoke insert, update, delete on public.games   from anon, authenticated;
revoke insert, update, delete on public.players from anon, authenticated;


-- =====================================================================
-- 4) CRÉATION AUTOMATIQUE DU JOUEUR À L'INSCRIPTION
-- =====================================================================
create or replace function public.creer_joueur()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.players (id, pseudo)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'pseudo', 'joueur_' || left(new.id::text, 6)));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.creer_joueur();


-- =====================================================================
-- 5) FONCTIONS INTERNES (non appelables depuis le navigateur)
-- =====================================================================

-- Mon numéro dans une partie : 1, 2, ou 0 si je n'y joue pas
create or replace function public._numero(g public.games)
returns int language sql stable as $$
  select case when auth.uid() = g.joueur1 then 1
              when auth.uid() = g.joueur2 then 2
              else 0 end
$$;

-- Le même algorithme que dans jeu.js : depuis la case jouée,
-- on compte les pions identiques dans les 4 directions (les 2 sens)
create or replace function public._ligne_gagnante(g text, p_case int, p_pion text)
returns boolean language plpgsql immutable as $$
declare
  v_l int := p_case / 4;
  v_c int := p_case % 4;
  v_dl int[] := array[0, 1, 1, 1];
  v_dc int[] := array[1, 0, 1, -1];
  v_total int; v_pas int; v_sens int; v_ll int; v_cc int;
begin
  for d in 1..4 loop
    v_total := 1;
    foreach v_sens in array array[1, -1] loop
      v_pas := 1;
      loop
        v_ll := v_l + v_dl[d] * v_pas * v_sens;
        v_cc := v_c + v_dc[d] * v_pas * v_sens;
        exit when v_ll < 0 or v_ll > 3 or v_cc < 0 or v_cc > 3;       -- bord de la grille
        exit when substr(g, v_ll * 4 + v_cc + 1, 1) <> p_pion;       -- autre symbole
        v_total := v_total + 1;
        v_pas := v_pas + 1;
      end loop;
    end loop;
    if v_total >= 4 then return true; end if;
  end loop;
  return false;
end $$;

-- Termine une partie et applique le système Elo
create or replace function public._terminer_partie(p_id uuid, p_gagnant int, p_raison text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_partie  public.games;
  v_r1      int;         -- points du joueur 1
  v_r2      int;         -- points du joueur 2
  v_attendu float8;      -- chance de gagner du joueur 1 (entre 0 et 1)
  v_score   float8;      -- résultat réel du joueur 1 : 1 victoire, 0 défaite, 0.5 nul
  v_delta   int;         -- points gagnés par le joueur 1 (= perdus par le joueur 2)
begin
  select * into v_partie from games where id = p_id for update;
  if v_partie.statut <> 'en_cours' then return; end if;

  select coalesce(points, 1000) into v_r1 from players where id = v_partie.joueur1;
  select coalesce(points, 1000) into v_r2 from players where id = v_partie.joueur2;
  v_r1 := coalesce(v_r1, 1000);
  v_r2 := coalesce(v_r2, 1000);

  -- Formule Elo : attendu = 1 / (1 + 10^((R2 - R1) / 400)), K = 32
  v_attendu := 1.0 / (1.0 + power(10.0, (v_r2 - v_r1) / 400.0));
  v_score   := case p_gagnant when 1 then 1.0 when 2 then 0.0 else 0.5 end;
  v_delta   := round(32 * (v_score - v_attendu));
  -- Le gagnant gagne toujours au moins 1 point
  if p_gagnant = 1 then v_delta := greatest(v_delta, 1); end if;
  if p_gagnant = 2 then v_delta := least(v_delta, -1); end if;

  update players set
    points    = greatest(100, points + v_delta),
    victoires = victoires + case when p_gagnant = 1 then 1 else 0 end,
    defaites  = defaites  + case when p_gagnant = 2 then 1 else 0 end
  where id = v_partie.joueur1;

  update players set
    points    = greatest(100, points - v_delta),
    victoires = victoires + case when p_gagnant = 2 then 1 else 0 end,
    defaites  = defaites  + case when p_gagnant = 1 then 1 else 0 end
  where id = v_partie.joueur2;

  update games set
    statut = 'terminee', gagnant = p_gagnant, fin_raison = p_raison,
    elo_j1 = v_delta, elo_j2 = -v_delta, version = version + 1
  where id = p_id;
end $$;


-- =====================================================================
-- 6) FONCTIONS APPELÉES PAR LE JEU (supabase.rpc(...))
-- =====================================================================

-- Créer une salle privée avec un code à 4 caractères
create or replace function public.creer_partie()
returns public.games language plpgsql security definer set search_path = public as $$
declare
  v_moi uuid := auth.uid();
  v_code text;
  -- Pas de I, O, 0, 1 : trop faciles à confondre
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_partie public.games;
begin
  if v_moi is null then raise exception 'Connexion requise'; end if;
  update games set statut = 'annulee', version = version + 1
    where joueur1 = v_moi and statut = 'attente';
  loop
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from games where code = v_code and statut in ('attente', 'en_cours'));
  end loop;
  insert into games (code, joueur1) values (v_code, v_moi) returning * into v_partie;
  return v_partie;
end $$;

-- Rejoindre une salle avec son code
create or replace function public.rejoindre_partie(p_code text)
returns public.games language plpgsql security definer set search_path = public as $$
declare
  v_moi uuid := auth.uid();
  v_partie public.games;
begin
  if v_moi is null then raise exception 'Connexion requise'; end if;
  select * into v_partie from games
    where code = upper(trim(p_code)) and statut = 'attente' and not rapide
    for update;
  if not found then raise exception 'Aucune salle avec ce code'; end if;
  if v_partie.joueur1 = v_moi then raise exception 'C''est ta propre salle : envoie le code à un ami'; end if;
  if v_partie.vu_j1 < now() - interval '45 seconds' then raise exception 'L''hôte de cette salle est parti'; end if;
  update games set statut = 'annulee', version = version + 1
    where joueur1 = v_moi and statut = 'attente';
  update games set
    joueur2 = v_moi, statut = 'en_cours', coup_at = now(), vu_j1 = now(), vu_j2 = now(), version = version + 1
  where id = v_partie.id returning * into v_partie;
  return v_partie;
end $$;

-- Partie rapide : rejoint le joueur qui attend depuis le plus longtemps, sinon attend
create or replace function public.partie_rapide()
returns public.games language plpgsql security definer set search_path = public as $$
declare
  v_moi uuid := auth.uid();
  v_partie public.games;
begin
  if v_moi is null then raise exception 'Connexion requise'; end if;
  update games set statut = 'annulee', version = version + 1
    where joueur1 = v_moi and statut = 'attente';
  -- « skip locked » : si deux joueurs cherchent en même temps, ils ne prennent pas la même place
  select * into v_partie from games
    where rapide and statut = 'attente' and joueur1 <> v_moi
      and vu_j1 > now() - interval '25 seconds'    -- ignore les joueurs partis sans annuler
    order by created_at
    limit 1
    for update skip locked;
  if found then
    update games set
      joueur2 = v_moi, statut = 'en_cours', coup_at = now(), vu_j1 = now(), vu_j2 = now(), version = version + 1
    where id = v_partie.id returning * into v_partie;
  else
    insert into games (rapide, joueur1) values (true, v_moi) returning * into v_partie;
  end if;
  return v_partie;
end $$;

-- Annuler une recherche ou une salle (renvoie false si la partie a déjà commencé)
create or replace function public.annuler_partie(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update games set statut = 'annulee', version = version + 1
    where id = p_id and joueur1 = auth.uid() and statut = 'attente';
  return found;
end $$;

-- Jouer un coup : TOUTES les règles sont vérifiées ici, côté serveur
create or replace function public.jouer_coup(p_id uuid, p_case int)
returns public.games language plpgsql security definer set search_path = public as $$
declare
  v_partie public.games;
  v_num int;
  v_pion text;
begin
  select * into v_partie from games where id = p_id for update;
  if not found then raise exception 'Partie introuvable'; end if;
  v_num := _numero(v_partie);
  if v_num = 0 then raise exception 'Tu ne joues pas dans cette partie'; end if;
  if v_partie.statut <> 'en_cours' then raise exception 'La partie est terminée'; end if;
  if v_partie.tour <> v_num then raise exception 'Ce n''est pas ton tour'; end if;
  if p_case < 0 or p_case > 15 then raise exception 'Case invalide'; end if;
  if substr(v_partie.grille, p_case + 1, 1) <> '0' then raise exception 'Cette case est déjà prise'; end if;

  v_pion := v_num::text;
  update games set
    grille = overlay(grille placing v_pion from p_case + 1 for 1),
    tour = 3 - v_num,
    dernier_coup = p_case,
    coup_at = now(),
    vu_j1 = case when v_num = 1 then now() else vu_j1 end,
    vu_j2 = case when v_num = 2 then now() else vu_j2 end,
    version = version + 1
  where id = p_id returning * into v_partie;

  if _ligne_gagnante(v_partie.grille, p_case, v_pion) then
    perform _terminer_partie(p_id, v_num, 'alignement');
  elsif position('0' in v_partie.grille) = 0 then
    perform _terminer_partie(p_id, 0, 'nul');
  end if;

  select * into v_partie from games where id = p_id;
  return v_partie;
end $$;

-- Chronomètre : si 30 s sont passées, le tour passe à l'autre joueur
create or replace function public.passer_tour_temps(p_id uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare
  v_partie public.games;
begin
  select * into v_partie from games where id = p_id for update;
  if not found or _numero(v_partie) = 0 then raise exception 'Partie introuvable'; end if;
  if v_partie.statut <> 'en_cours' then return v_partie; end if;
  if now() - v_partie.coup_at < interval '30 seconds' then raise exception 'Le temps n''est pas écoulé'; end if;
  update games set tour = 3 - tour, coup_at = now(), version = version + 1
    where id = p_id returning * into v_partie;
  return v_partie;
end $$;

-- « Je suis toujours là » (appelé toutes les 10 secondes)
create or replace function public.ping(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update games set
    vu_j1 = case when auth.uid() = joueur1 then now() else vu_j1 end,
    vu_j2 = case when auth.uid() = joueur2 then now() else vu_j2 end,
    version = version + 1
  where id = p_id and auth.uid() in (joueur1, joueur2) and statut in ('attente', 'en_cours');
end $$;

-- L'adversaire ne donne plus signe de vie depuis 60 s → je gagne
create or replace function public.reclamer_abandon(p_id uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare
  v_partie public.games;
  v_num int;
  v_vu timestamptz;
begin
  select * into v_partie from games where id = p_id for update;
  v_num := _numero(v_partie);
  if not found or v_num = 0 then raise exception 'Partie introuvable'; end if;
  if v_partie.statut <> 'en_cours' then return v_partie; end if;
  v_vu := coalesce(case when v_num = 1 then v_partie.vu_j2 else v_partie.vu_j1 end, '-infinity');
  if v_vu > now() - interval '60 seconds' then raise exception 'Ton adversaire est encore là'; end if;
  perform _terminer_partie(p_id, v_num, 'abandon');
  select * into v_partie from games where id = p_id;
  return v_partie;
end $$;

-- J'abandonne volontairement → l'adversaire gagne
create or replace function public.abandonner(p_id uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare
  v_partie public.games;
  v_num int;
begin
  select * into v_partie from games where id = p_id for update;
  v_num := _numero(v_partie);
  if not found or v_num = 0 then raise exception 'Partie introuvable'; end if;
  if v_partie.statut = 'en_cours' then
    perform _terminer_partie(p_id, 3 - v_num, 'forfait');
  elsif v_partie.statut = 'attente' and v_num = 1 then
    update games set statut = 'annulee', version = version + 1 where id = p_id;
  end if;
  select * into v_partie from games where id = p_id;
  return v_partie;
end $$;

-- Revanche : quand les DEUX joueurs l'ont demandée, une nouvelle partie est créée
-- (les couleurs sont inversées : l'autre joueur commence)
create or replace function public.demander_revanche(p_id uuid)
returns public.games language plpgsql security definer set search_path = public as $$
declare
  v_partie public.games;
  v_nouvelle public.games;
  v_num int;
begin
  select * into v_partie from games where id = p_id for update;
  v_num := _numero(v_partie);
  if not found or v_num = 0 then raise exception 'Partie introuvable'; end if;
  if v_partie.statut <> 'terminee' then raise exception 'La partie n''est pas terminée'; end if;
  if v_partie.revanche_id is not null then return v_partie; end if;

  if v_num = 1 then v_partie.revanche_j1 := true; else v_partie.revanche_j2 := true; end if;

  if v_partie.revanche_j1 and v_partie.revanche_j2 then
    insert into games (joueur1, joueur2, statut, rapide, coup_at, vu_j1, vu_j2)
    values (v_partie.joueur2, v_partie.joueur1, 'en_cours', v_partie.rapide, now(), now(), now())
    returning * into v_nouvelle;
    v_partie.revanche_id := v_nouvelle.id;
  end if;

  update games set
    revanche_j1 = v_partie.revanche_j1,
    revanche_j2 = v_partie.revanche_j2,
    revanche_id = v_partie.revanche_id,
    version = version + 1
  where id = p_id returning * into v_partie;
  return v_partie;
end $$;


-- =====================================================================
-- 7) QUI PEUT APPELER QUOI
-- =====================================================================
-- Les fonctions internes : personne depuis le navigateur
revoke all on function public._numero(public.games)                from public, anon, authenticated;
revoke all on function public._ligne_gagnante(text, int, text)      from public, anon, authenticated;
revoke all on function public._terminer_partie(uuid, int, text)     from public, anon, authenticated;

-- Les fonctions du jeu : uniquement les joueurs connectés
revoke all on function public.creer_partie()               from public, anon;
revoke all on function public.rejoindre_partie(text)       from public, anon;
revoke all on function public.partie_rapide()              from public, anon;
revoke all on function public.annuler_partie(uuid)         from public, anon;
revoke all on function public.jouer_coup(uuid, int)        from public, anon;
revoke all on function public.passer_tour_temps(uuid)      from public, anon;
revoke all on function public.ping(uuid)                   from public, anon;
revoke all on function public.reclamer_abandon(uuid)       from public, anon;
revoke all on function public.abandonner(uuid)             from public, anon;
revoke all on function public.demander_revanche(uuid)      from public, anon;
grant execute on function public.creer_partie()            to authenticated;
grant execute on function public.rejoindre_partie(text)    to authenticated;
grant execute on function public.partie_rapide()           to authenticated;
grant execute on function public.annuler_partie(uuid)      to authenticated;
grant execute on function public.jouer_coup(uuid, int)     to authenticated;
grant execute on function public.passer_tour_temps(uuid)   to authenticated;
grant execute on function public.ping(uuid)                to authenticated;
grant execute on function public.reclamer_abandon(uuid)    to authenticated;
grant execute on function public.abandonner(uuid)          to authenticated;
grant execute on function public.demander_revanche(uuid)   to authenticated;


-- =====================================================================
-- 8) TEMPS RÉEL : prévenir les joueurs à chaque changement de partie
-- =====================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;
