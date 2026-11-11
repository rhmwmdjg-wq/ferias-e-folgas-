-- =====================================================================
-- ATLAS SAÚDE — SEGURANÇA — PARTE B: FECHAR O BANCO
-- =====================================================================
-- O que faz: troca as regras "Permitir tudo" por regras por perfil.
--   * Sem login ............ não lê nem grava nada.
--   * Admin e gestores ..... acessam os dados de gestão.
--   * Servidor ............. vê só o próprio cadastro, férias, folgas,
--                            banco de horas e solicitações.
--
-- ATENÇÃO — só rode DEPOIS de:
--   1) ter rodado a Parte A;
--   2) o sistema NOVO (com o novo login) estar publicado e testado.
-- O sistema antigo PARA de funcionar depois deste script.
--
-- Este script considera que este projeto Supabase é usado SOMENTE pelo
-- Atlas Saúde. Se outro sistema usa o mesmo projeto, NÃO rode.
--
-- Se algo der errado, o arquivo "Z_emergencia_reabrir.sql" desfaz.
-- =====================================================================

-- Trava de segurança: sem a Parte A, este script trancaria todo mundo.
do $$
begin
  if to_regprocedure('public.atlas_is_gestao()') is null then
    raise exception 'Rode primeiro a Parte A (A_contas_de_login.sql).';
  end if;
  if not exists (select 1 from auth.users
                  where email like 'g-%@atlas-aps.internal'
                    and raw_app_meta_data ->> 'atlas_role' = 'admin') then
    raise exception 'Nenhuma conta de administrador encontrada. Rode a Parte A e confira antes de continuar.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Todas as tabelas: liga a proteção, apaga as regras antigas e
--    libera apenas para admin/gestor logado.
-- ---------------------------------------------------------------------
do $$
declare
  t record;
  p record;
begin
  for t in
    select c.relname as nome
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', t.nome);

    for p in select policyname from pg_policies
              where schemaname = 'public' and tablename = t.nome loop
      execute format('drop policy %I on public.%I', p.policyname, t.nome);
    end loop;

    execute format('revoke all on public.%I from anon', t.nome);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.nome);

    execute format(
      'create policy atlas_gestao on public.%I for all to authenticated '
      || 'using (public.atlas_is_gestao()) with check (public.atlas_is_gestao())', t.nome);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Exceções
-- ---------------------------------------------------------------------

-- 2.1 Gestores: todos da gestão leem; só o admin cadastra/edita/exclui.
drop policy if exists atlas_gestao on public.gestores;
create policy atlas_gestores_ler on public.gestores for select to authenticated
  using (public.atlas_is_gestao());
create policy atlas_gestores_admin on public.gestores for all to authenticated
  using (public.atlas_is_admin()) with check (public.atlas_is_admin());

-- 2.2 Logs de auditoria: qualquer pessoa logada registra; gestão lê;
--     só o admin altera ou apaga.
drop policy if exists atlas_gestao on public.logs;
create policy atlas_logs_ler on public.logs for select to authenticated
  using (public.atlas_is_gestao());
create policy atlas_logs_gravar on public.logs for insert to authenticated
  with check (true);
create policy atlas_logs_admin_alterar on public.logs for update to authenticated
  using (public.atlas_is_admin()) with check (public.atlas_is_admin());
create policy atlas_logs_admin_excluir on public.logs for delete to authenticated
  using (public.atlas_is_admin());

-- 2.3 Configurações: qualquer pessoa logada lê, menos a lista de links de
--     comprovantes (a gestão lê e grava tudo pela regra geral).
create policy atlas_config_ler on public.configuracoes for select to authenticated
  using (chave <> 'comprovantes');

-- 2.4 Servidor vê o próprio cadastro.
create policy atlas_servidor_proprio on public.servidores for select to authenticated
  using (public.atlas_role() = 'servidor' and id::text = public.atlas_id());

-- 2.5 Servidor vê as próprias férias, folgas, banco de horas e solicitações.
--     (descobre sozinho se a coluna se chama "srvId" ou srvid)
do $$
declare
  v_tab text;
  v_col text;
begin
  foreach v_tab in array array['programacoes', 'folgas', 'banco_horas', 'solicitacoes'] loop
    select quote_ident(column_name) into v_col
      from information_schema.columns
     where table_schema = 'public' and table_name = v_tab and lower(column_name) = 'srvid'
     order by (column_name = 'srvId') desc
     limit 1;

    if v_col is null then
      raise notice 'Tabela % sem coluna srvId: servidores não terão acesso a ela.', v_tab;
      continue;
    end if;

    execute format(
      'create policy atlas_servidor_ler on public.%I for select to authenticated '
      || 'using (public.atlas_role() = ''servidor'' and %s::text = public.atlas_id())', v_tab, v_col);

    if v_tab = 'solicitacoes' then
      -- Servidor cria, edita e exclui as PRÓPRIAS solicitações enquanto pendentes.
      execute format(
        'create policy atlas_servidor_criar on public.solicitacoes for insert to authenticated '
        || 'with check (public.atlas_role() = ''servidor'' and %s::text = public.atlas_id() and status = ''pendente'')', v_col);
      execute format(
        'create policy atlas_servidor_editar on public.solicitacoes for update to authenticated '
        || 'using (public.atlas_role() = ''servidor'' and %s::text = public.atlas_id() and status = ''pendente'') '
        || 'with check (public.atlas_role() = ''servidor'' and %s::text = public.atlas_id() and status = ''pendente'')', v_col, v_col);
      execute format(
        'create policy atlas_servidor_excluir on public.solicitacoes for delete to authenticated '
        || 'using (public.atlas_role() = ''servidor'' and %s::text = public.atlas_id() and status = ''pendente'')', v_col);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Visões e funções antigas: passam a respeitar as regras acima
-- ---------------------------------------------------------------------
do $$
declare
  v record;
  f record;
begin
  for v in
    select c.relname as nome
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
  loop
    begin
      execute format('alter view public.%I set (security_invoker = true)', v.nome);
      execute format('revoke all on public.%I from anon', v.nome);
    exception when others then
      raise notice 'Visão % não alterada: %', v.nome, sqlerrm;
    end;
  end loop;

  for f in
    select p.oid::regprocedure::text as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname not like 'atlas%'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    begin
      execute format('revoke execute on function %s from public, anon', f.assinatura);
      execute format('alter function %s security invoker', f.assinatura);
      execute format('grant execute on function %s to authenticated', f.assinatura);
    exception when others then
      raise notice 'Função % não alterada: %', f.assinatura, sqlerrm;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Arquivos (Storage): só a gestão envia, troca, lista e apaga.
--    Os links públicos de logos e fotos que já existem continuam abrindo.
-- ---------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'storage' and tablename = 'objects' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end;
$$;

create policy atlas_storage_gestao on storage.objects for all to authenticated
  using (public.atlas_is_gestao()) with check (public.atlas_is_gestao());

-- ---------------------------------------------------------------------
-- 5. Conferência: toda tabela deve aparecer com protegida = true
-- ---------------------------------------------------------------------
select c.relname as tabela,
       c.relrowsecurity as protegida,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as regras
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p')
 order by 1;
