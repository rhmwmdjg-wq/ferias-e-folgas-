-- Atlas Saúde — Ouvidoria anônima (já aplicado no projeto das edge functions).
-- Nada aqui identifica quem escreveu: não há IP, navegador, aparelho, nome,
-- telefone, e-mail nem login. O único dado do contexto é a unidade de saúde.
create table if not exists public.atlas_ouvidoria (
  id uuid primary key default gen_random_uuid(),
  protocolo text not null unique,
  criado_em timestamptz not null default now(),
  tipo text not null check (tipo in ('sugestao', 'reclamacao', 'denuncia')),
  unidade text not null,
  mensagem text not null,
  situacao text not null default 'nova'
    check (situacao in ('nova', 'em_analise', 'providencia', 'concluida', 'arquivada')),
  nota_interna text,
  atualizado_em timestamptz
);

create index if not exists atlas_ouvidoria_criado_em_idx on public.atlas_ouvidoria (criado_em desc);
create index if not exists atlas_ouvidoria_unidade_idx on public.atlas_ouvidoria (unidade);
create index if not exists atlas_ouvidoria_tipo_idx on public.atlas_ouvidoria (tipo);

create table if not exists public.atlas_ouvidoria_unidades (
  nome text primary key,
  ordem int not null default 0
);

-- RLS ligado e sem nenhuma policy: anon e authenticated não leem nem escrevem.
-- Todo acesso passa pela edge function atlas-ouvidoria (service role).
alter table public.atlas_ouvidoria enable row level security;
alter table public.atlas_ouvidoria_unidades enable row level security;
