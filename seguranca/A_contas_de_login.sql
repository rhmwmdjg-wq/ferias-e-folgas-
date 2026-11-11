-- =====================================================================
-- ATLAS SAÚDE — SEGURANÇA — PARTE A: CONTAS DE LOGIN
-- =====================================================================
-- O que faz: cria uma conta no login oficial do Supabase (Auth) para cada
-- gestor e servidor que já tem senha, mantendo a MESMA senha de hoje.
-- Também cria as funções que o sistema novo usa.
--
-- É seguro rodar com o sistema atual no ar: esta parte só ACRESCENTA
-- coisas, não bloqueia nem apaga nada. Pode rodar mais de uma vez.
--
-- Onde rodar: painel do Supabase > SQL Editor > colar tudo > Run.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Funções de apoio (perfil de quem está logado)
-- ---------------------------------------------------------------------
create or replace function public.atlas_role() returns text
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'atlas_role', '')
$$;

create or replace function public.atlas_id() returns text
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'atlas_id', '')
$$;

create or replace function public.atlas_is_gestao() returns boolean
language sql stable as $$
  select public.atlas_role() in ('admin', 'gestor')
$$;

create or replace function public.atlas_is_admin() returns boolean
language sql stable as $$
  select public.atlas_role() = 'admin'
$$;

-- E-mail interno da conta (ninguém recebe e-mail; é só o identificador).
create or replace function public.atlas_email(p_tipo text, p_id text) returns text
language sql immutable as $$
  select case when p_tipo = 'gestores' then 'g-' else 's-' end
         || regexp_replace(lower(p_id), '[^a-z0-9_-]', '', 'g')
         || '@atlas-aps.internal'
$$;

-- ---------------------------------------------------------------------
-- 2. Função interna: cria ou atualiza a conta de login de um cadastro
--    (não pode ser chamada de fora; só pelas funções abaixo)
-- ---------------------------------------------------------------------
create or replace function public.atlas__upsert_login(
  p_tipo text, p_id text, p_senha_hash text, p_forcar_troca boolean
) returns uuid
language plpgsql security definer
set search_path = extensions, public, pg_temp
as $$
declare
  v_email text := public.atlas_email(p_tipo, p_id);
  v_role  text;
  v_uid   uuid;
  v_meta  jsonb;
begin
  if p_senha_hash is null or p_senha_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Senha em formato inválido';
  end if;

  if p_tipo = 'gestores' then
    select case when coalesce(g.role, '') = 'admin' or lower(btrim(g.usuario)) = 'admin'
                then 'admin' else 'gestor' end
      into v_role
      from public.gestores g where g.id::text = p_id;
  elsif p_tipo = 'servidores' then
    select 'servidor' into v_role from public.servidores s where s.id::text = p_id;
  end if;

  if v_role is null then
    raise exception 'Cadastro não encontrado';
  end if;

  v_meta := jsonb_build_object(
    'provider', 'email',
    'providers', jsonb_build_array('email'),
    'atlas_role', v_role,
    'atlas_id', p_id,
    'trocar_senha', coalesce(p_forcar_troca, false)
  );

  select u.id into v_uid from auth.users u where u.email = v_email;

  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, crypt(p_senha_hash, gen_salt('bf', 10)), now(),
      v_meta, '{}'::jsonb, now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email,
                         'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  else
    update auth.users
       set encrypted_password = crypt(p_senha_hash, gen_salt('bf', 10)),
           raw_app_meta_data  = v_meta,
           updated_at         = now()
     where id = v_uid;
  end if;

  return v_uid;
end;
$$;

revoke all on function public.atlas__upsert_login(text, text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Funções que o sistema chama
-- ---------------------------------------------------------------------

-- 3.1 Tela de login: converte "usuário ou matrícula" na conta interna.
--     Não revela se o usuário existe (sempre devolve ao menos uma linha).
create or replace function public.atlas_resolver_login(p_usuario text)
returns table (email text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if p_usuario is null or length(btrim(p_usuario)) = 0 or length(p_usuario) > 80 then
    return;
  end if;

  return query
    select public.atlas_email('gestores', g.id::text)
      from public.gestores g
     where lower(btrim(g.usuario)) = lower(btrim(p_usuario))
    union all
    select public.atlas_email('servidores', s.id::text)
      from public.servidores s
     where btrim(s.matricula::text) = btrim(p_usuario);

  if not found then
    return query select 'x-' || md5(lower(btrim(p_usuario))) || '@atlas-aps.internal';
  end if;
end;
$$;

revoke all on function public.atlas_resolver_login(text) from public;
grant execute on function public.atlas_resolver_login(text) to anon, authenticated;

-- 3.2 Gestão define/redefine a senha de alguém.
--     Senha de gestor: só o admin. Senha de servidor: admin ou gestor.
create or replace function public.atlas_definir_senha(
  p_tipo text, p_id text, p_senha_hash text, p_forcar_troca boolean default true
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_tipo = 'gestores' then
    if not public.atlas_is_admin() then
      raise exception 'Apenas o administrador pode definir senha de gestor';
    end if;
  elsif p_tipo = 'servidores' then
    if not public.atlas_is_gestao() then
      raise exception 'Sem permissão para definir senha de servidor';
    end if;
  else
    raise exception 'Tipo inválido';
  end if;

  perform public.atlas__upsert_login(p_tipo, p_id, p_senha_hash, p_forcar_troca);
end;
$$;

revoke all on function public.atlas_definir_senha(text, text, text, boolean) from public, anon;
grant execute on function public.atlas_definir_senha(text, text, text, boolean) to authenticated;

-- 3.3 A própria pessoa troca a senha dela.
create or replace function public.atlas_trocar_minha_senha(p_senha_hash text)
returns void
language plpgsql security definer
set search_path = extensions, public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado';
  end if;
  if p_senha_hash is null or p_senha_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Senha em formato inválido';
  end if;

  update auth.users
     set encrypted_password = crypt(p_senha_hash, gen_salt('bf', 10)),
         raw_app_meta_data  = coalesce(raw_app_meta_data, '{}'::jsonb)
                              || jsonb_build_object('trocar_senha', false),
         updated_at         = now()
   where id = auth.uid();
end;
$$;

revoke all on function public.atlas_trocar_minha_senha(text) from public, anon;
grant execute on function public.atlas_trocar_minha_senha(text) to authenticated;

-- 3.4 Aparência da tela de login (logos, título, cores). Nada pessoal.
create or replace function public.atlas_config_publica()
returns table (chave text, valor text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.chave::text, c.valor::text
    from public.configuracoes c
   where c.chave like 'img\_%'
      or c.chave in ('tituloSidebar', 'subtituloSidebar', 'nomeOrganizacao',
                     'tema', 'estiloBase', 'tamanhoLogoHeader', 'tamanhoFonteOrg',
                     'coordenadorAPS', 'cargoCoordenador')
$$;

revoke all on function public.atlas_config_publica() from public;
grant execute on function public.atlas_config_publica() to anon, authenticated;

-- 3.5 Links públicos de documentos (quem tem o link vê só aquele documento).
create or replace function public.atlas_oficio_publico(p_token text)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(o) from public.oficios o
   where length(coalesce(p_token, '')) >= 8 and o.token = p_token
   limit 1
$$;

create or replace function public.atlas_notificacao_publica(p_token text)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(n) from public.notificacoes n
   where length(coalesce(p_token, '')) >= 8 and n.token = p_token
   limit 1
$$;

create or replace function public.atlas_comprovante_publico(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_mapa   jsonb;
  v_folga  jsonb;
  v_srv    jsonb;
  v_fid    text;
begin
  if length(coalesce(p_token, '')) < 6 then return null; end if;

  begin
    select c.valor::jsonb into v_mapa from public.configuracoes c where c.chave = 'comprovantes';
  exception when others then
    return null;
  end;
  if v_mapa is null then return null; end if;

  v_fid := v_mapa ->> p_token;
  if v_fid is null then return null; end if;

  select to_jsonb(f) into v_folga from public.folgas f where f.id::text = v_fid;
  if v_folga is null then return null; end if;

  select jsonb_build_object('id', s.id, 'nome', s.nome, 'matricula', s.matricula,
                            'setor', s.setor, 'cargo', s.cargo)
    into v_srv
    from public.servidores s
   where s.id::text = coalesce(v_folga ->> 'srvId', v_folga ->> 'srvid');

  return jsonb_build_object('folga', v_folga, 'servidor', v_srv);
end;
$$;

revoke all on function public.atlas_oficio_publico(text) from public;
revoke all on function public.atlas_notificacao_publica(text) from public;
revoke all on function public.atlas_comprovante_publico(text) from public;
grant execute on function public.atlas_oficio_publico(text) to anon, authenticated;
grant execute on function public.atlas_notificacao_publica(text) to anon, authenticated;
grant execute on function public.atlas_comprovante_publico(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Manter as contas em dia quando o cadastro muda
-- ---------------------------------------------------------------------
-- Excluiu o gestor/servidor -> a conta de login some junto.
create or replace function public.atlas__ao_excluir_cadastro() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  delete from auth.users where email = public.atlas_email(tg_table_name, old.id::text);
  return old;
end;
$$;

-- Mudou o perfil/usuário do gestor -> atualiza o perfil gravado na conta.
create or replace function public.atlas__ao_alterar_gestor() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := case when coalesce(new.role, '') = 'admin' or lower(btrim(new.usuario)) = 'admin'
                      then 'admin' else 'gestor' end;
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('atlas_role', v_role),
         updated_at = now()
   where email = public.atlas_email('gestores', new.id::text)
     and coalesce(raw_app_meta_data ->> 'atlas_role', '') <> v_role;
  return new;
end;
$$;

revoke all on function public.atlas__ao_excluir_cadastro() from public, anon, authenticated;
revoke all on function public.atlas__ao_alterar_gestor() from public, anon, authenticated;

drop trigger if exists atlas_excluir_login on public.gestores;
create trigger atlas_excluir_login after delete on public.gestores
  for each row execute function public.atlas__ao_excluir_cadastro();

drop trigger if exists atlas_excluir_login on public.servidores;
create trigger atlas_excluir_login after delete on public.servidores
  for each row execute function public.atlas__ao_excluir_cadastro();

drop trigger if exists atlas_alterar_gestor on public.gestores;
create trigger atlas_alterar_gestor after update on public.gestores
  for each row execute function public.atlas__ao_alterar_gestor();

-- ---------------------------------------------------------------------
-- 5. Migração: cria a conta de quem já tem senha (mantém a mesma senha)
--    Quem estava com senha em texto puro fica marcado para TROCAR A SENHA
--    no primeiro acesso. Quem já tem conta não é alterado (pode re-rodar).
-- ---------------------------------------------------------------------
do $$
declare
  r        record;
  v_hash   text;
  v_puro   boolean;
  v_novos  int := 0;
begin
  -- Depois da Parte C a coluna "senha" não existe mais: aí não há o que migrar.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'gestores' and column_name = 'senha')
     or not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'servidores' and column_name = 'senha') then
    raise notice 'Coluna senha já removida: nada a migrar.';
    return;
  end if;

  for r in execute $q$
    select 'gestores'::text as tipo, g.id::text as id, btrim(g.senha::text) as senha
      from public.gestores g where coalesce(btrim(g.senha::text), '') <> ''
    union all
    select 'servidores', s.id::text, btrim(s.senha::text)
      from public.servidores s where coalesce(btrim(s.senha::text), '') <> ''
  $q$
  loop
    if exists (select 1 from auth.users u where u.email = public.atlas_email(r.tipo, r.id)) then
      continue;
    end if;
    v_puro := r.senha !~ '^[a-f0-9]{64}$';
    v_hash := case when v_puro
                   then encode(extensions.digest(convert_to(r.senha, 'UTF8'), 'sha256'), 'hex')
                   else r.senha end;
    perform public.atlas__upsert_login(r.tipo, r.id, v_hash, v_puro);
    v_novos := v_novos + 1;
  end loop;
  raise notice 'Contas de login criadas agora: %', v_novos;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Conferência (o resultado aparece embaixo, no painel)
-- ---------------------------------------------------------------------
select
  (select count(*) from auth.users where email like 'g-%@atlas-aps.internal') as contas_gestores,
  (select count(*) from public.gestores)                                       as total_gestores,
  (select count(*) from auth.users where email like 's-%@atlas-aps.internal') as contas_servidores,
  (select count(*) from public.servidores)                                     as total_servidores,
  (select count(*) from auth.users
    where email like '%@atlas-aps.internal'
      and raw_app_meta_data ->> 'trocar_senha' = 'true')                       as vao_trocar_senha;
