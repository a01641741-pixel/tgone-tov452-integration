-- ============================================================================
-- Votify — esquema base
--
-- Tres decisiones que vale la pena leer antes del DDL:
--
-- 1. MULTI-TENANT SIN EXCEPCIONES. Toda tabla lleva venue_id, incluso cuando es
--    derivable por join. Es redundante a propósito: permite que RLS filtre por
--    tenant sin joins en el camino caliente, y hace que un bug de aislamiento
--    sea un error de constraint en vez de una fuga silenciosa entre negocios.
--
-- 2. EL PRESUPUESTO DE VOTOS SE APLICA EN LA BASE, NO EN EL SERVIDOR. Dos
--    peticiones simultáneas del mismo teléfono pueden pasar la validación de
--    aplicación a la vez; no pueden pasar un UNIQUE. La credibilidad de la
--    votación es lo único que este producto no puede perder.
--
-- 3. EL CONTEO ESTÁ MATERIALIZADO. Nadie hace COUNT(*) sobre votes para pintar
--    la pantalla. Un trigger mantiene round_option_tallies, y el realtime
--    transmite esas filas. Con 500 personas votando, agregar en cada lectura es
--    justo lo que tumba la noche más concurrida — que es la que hay que ganar.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table venues (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  timezone    text        not null default 'America/Monterrey',
  created_at  timestamptz not null default now()
);

create table rooms (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid        not null references venues(id) on delete cascade,
  name        text        not null,
  status      text        not null default 'scheduled'
                check (status in ('scheduled', 'live', 'closed')),
  -- Lo que codifica el QR de la mesa. Rota por sesión: un código filtrado
  -- caduca con la noche en lugar de servir para siempre.
  join_code   text        not null,
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz
);

create unique index rooms_active_join_code_idx
  on rooms (join_code) where status <> 'closed';
create index rooms_venue_idx on rooms (venue_id, status);

-- ---------------------------------------------------------------------------
-- Identidad
-- ---------------------------------------------------------------------------

-- El activo real de Votify: sobrevive al evento y viaja entre establecimientos.
create table profiles (
  id          uuid primary key default gen_random_uuid(),
  handle      text unique,
  display_name text,
  created_at  timestamptz not null default now()
);

-- Identidad efímera dentro de una Room. Nace anónima (profile_id null).
create table participants (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid        not null references venues(id) on delete cascade,
  room_id     uuid        not null references rooms(id) on delete cascade,
  profile_id  uuid        references profiles(id) on delete set null,
  display_name text,
  -- Peso del voto. Siempre 1 hoy; existe para que gamificación y promociones
  -- no obliguen a recalcular históricos cuando lleguen.
  vote_weight smallint    not null default 1 check (vote_weight > 0),
  joined_at   timestamptz not null default now()
);

create index participants_room_idx on participants (room_id);
create index participants_profile_idx on participants (profile_id) where profile_id is not null;

-- ---------------------------------------------------------------------------
-- Momentos — la unidad de experiencia y la unidad de analítica
-- ---------------------------------------------------------------------------

create table moments (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid        not null references venues(id) on delete cascade,
  room_id     uuid        not null references rooms(id) on delete cascade,
  -- text y no enum: agregar 'trivia' o 'beer_pong' no debe requerir migración.
  kind        text        not null,
  mechanic    text        not null
                check (mechanic in ('vote', 'broadcast', 'reaction', 'ambient')),
  status      text        not null default 'draft'
                check (status in ('draft', 'scheduled', 'live', 'settled', 'cancelled')),
  title       text        not null,
  -- Quién lo originó y por qué. Con 'experience_engine' se guarda el rationale:
  -- esto es, literalmente, el dataset con el que se entrenará la IA después.
  origin      jsonb       not null default '{"by":"host"}'::jsonb,
  started_at  timestamptz,
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);

create index moments_room_idx on moments (room_id, created_at desc);
create index moments_analytics_idx on moments (venue_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Votación
-- ---------------------------------------------------------------------------

create table voting_rounds (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid        not null references venues(id) on delete cascade,
  moment_id   uuid        not null references moments(id) on delete cascade,
  status      text        not null default 'open' check (status in ('open', 'closed')),
  -- La política completa (presupuesto, stacking, cierre, desempate) como jsonb:
  -- es configuración de producto, y no debe costar una migración por cada
  -- variante que pida un tipo de venue distinto.
  policy      jsonb       not null,
  budget_per_participant smallint not null default 1 check (budget_per_participant > 0),
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz
);

-- Un Momento con mecánica de voto tiene exactamente una ronda abierta a la vez.
create unique index voting_rounds_one_open_per_moment_idx
  on voting_rounds (moment_id) where status = 'open';

create table round_options (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid        not null references venues(id) on delete cascade,
  round_id      uuid        not null references voting_rounds(id) on delete cascade,
  -- Referencia opaca al contenido. La base tampoco sabe qué es una canción.
  content_type  text        not null,
  content_id    text        not null,
  display       jsonb       not null,
  payload       jsonb       not null default '{}'::jsonb,
  position      smallint    not null default 0
);

create unique index round_options_unique_content_idx
  on round_options (round_id, content_type, content_id);
create index round_options_round_idx on round_options (round_id, position);

create table votes (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid        not null references venues(id) on delete cascade,
  round_id        uuid        not null references voting_rounds(id) on delete cascade,
  option_id       uuid        not null references round_options(id) on delete cascade,
  participant_id  uuid        not null references participants(id) on delete cascade,
  weight          smallint    not null default 1 check (weight > 0),
  -- Posición dentro del presupuesto (0..budget-1). Es lo que convierte "máximo
  -- N votos por persona" en una garantía de la base y no en una esperanza.
  vote_slot       smallint    not null check (vote_slot >= 0),
  idempotency_key text        not null,
  cast_at         timestamptz not null default now()
);

-- El doble tap y el reintento por red mala colapsan en la misma fila.
create unique index votes_idempotency_idx on votes (round_id, idempotency_key);
-- El presupuesto, a prueba de carreras.
create unique index votes_budget_idx on votes (round_id, participant_id, vote_slot);
create index votes_round_idx on votes (round_id);
create index votes_option_idx on votes (option_id);

create or replace function enforce_vote_slot_budget() returns trigger
language plpgsql as $$
declare
  max_budget smallint;
begin
  select budget_per_participant into max_budget
    from voting_rounds where id = new.round_id;

  if max_budget is null then
    raise exception 'ronda % inexistente', new.round_id;
  end if;

  if new.vote_slot >= max_budget then
    raise exception 'presupuesto agotado: slot % con presupuesto %', new.vote_slot, max_budget
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger votes_budget_trigger
  before insert on votes
  for each row execute function enforce_vote_slot_budget();

-- ---------------------------------------------------------------------------
-- Conteo materializado — lo que realmente se transmite a la sala
-- ---------------------------------------------------------------------------

create table round_option_tallies (
  round_id      uuid        not null references voting_rounds(id) on delete cascade,
  option_id     uuid        not null references round_options(id) on delete cascade,
  venue_id      uuid        not null references venues(id) on delete cascade,
  votes         integer     not null default 0,
  first_vote_at timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (round_id, option_id)
);

create or replace function apply_vote_to_tally() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into round_option_tallies (round_id, option_id, venue_id, votes, first_vote_at, updated_at)
      values (new.round_id, new.option_id, new.venue_id, new.weight, new.cast_at, now())
    on conflict (round_id, option_id) do update
      set votes         = round_option_tallies.votes + excluded.votes,
          first_vote_at = least(round_option_tallies.first_vote_at, excluded.first_vote_at),
          updated_at    = now();
    return new;
  end if;

  if tg_op = 'DELETE' then
    update round_option_tallies
      set votes = greatest(0, votes - old.weight),
          updated_at = now()
      where round_id = old.round_id and option_id = old.option_id;
    return old;
  end if;

  return null;
end;
$$;

create trigger votes_tally_trigger
  after insert or delete on votes
  for each row execute function apply_vote_to_tally();

-- ---------------------------------------------------------------------------
-- Resultados — hechos inmutables
-- ---------------------------------------------------------------------------

create table round_results (
  round_id      uuid primary key references voting_rounds(id) on delete cascade,
  venue_id      uuid        not null references venues(id) on delete cascade,
  moment_id     uuid        not null references moments(id) on delete cascade,
  outcome_kind  text        not null check (outcome_kind in ('winner', 'tied', 'no_votes')),
  winning_option_id uuid    references round_options(id) on delete set null,
  -- Foto del conteo al momento de decidir. Se archiva aunque los votos se
  -- borren: el resultado de una noche no puede depender de datos vivos.
  tally_snapshot jsonb      not null,
  decided_at    timestamptz not null default now()
);

create index round_results_analytics_idx on round_results (venue_id, decided_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Se habilita desde el primer commit y por defecto niega todo. Las políticas
-- concretas dependen del proveedor de auth y se agregan en 0002; lo importante
-- es que ninguna tabla nazca abierta.
-- ---------------------------------------------------------------------------

alter table venues                enable row level security;
alter table rooms                 enable row level security;
alter table profiles              enable row level security;
alter table participants          enable row level security;
alter table moments               enable row level security;
alter table voting_rounds         enable row level security;
alter table round_options         enable row level security;
alter table votes                 enable row level security;
alter table round_option_tallies  enable row level security;
alter table round_results         enable row level security;

-- NOTA: los clientes nunca hacen INSERT directo en votes. El voto entra por una
-- función server-side que asigna vote_slot, valida la ronda y aplica idempotencia.
-- Sin esa regla, el presupuesto y el antifraude quedan en manos del navegador.
