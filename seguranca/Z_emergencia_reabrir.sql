-- =====================================================================
-- ATLAS SAÚDE — EMERGÊNCIA: DESFAZER A PARTE B
-- =====================================================================
-- Use SOMENTE se, depois da Parte B, o sistema parar de funcionar e for
-- preciso voltar a trabalhar imediatamente.
--
-- ATENÇÃO: este script deixa o banco ABERTO de novo, como estava antes
-- (qualquer pessoa com a chave pública lê e altera os dados).
-- É um remendo temporário: avise para corrigirmos e rode a Parte B de novo.
-- =====================================================================
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
    for p in select policyname from pg_policies
              where schemaname = 'public' and tablename = t.nome loop
      execute format('drop policy %I on public.%I', p.policyname, t.nome);
    end loop;
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t.nome);
    execute format(
      'create policy "EMERGENCIA permitir tudo" on public.%I for all using (true) with check (true)', t.nome);
  end loop;

  for t in
    select pr.oid::regprocedure::text as nome
      from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
     where n.nspname = 'public' and pr.prokind = 'f' and pr.proname not like 'atlas%'
       and not exists (select 1 from pg_depend d where d.objid = pr.oid and d.deptype = 'e')
  loop
    begin
      execute format('grant execute on function %s to anon, authenticated', t.nome);
    exception when others then null;
    end;
  end loop;

  for p in select policyname from pg_policies
            where schemaname = 'storage' and tablename = 'objects' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end;
$$;

create policy "EMERGENCIA storage permitir tudo" on storage.objects
  for all using (true) with check (true);

select 'Banco REABERTO (modo emergência). Rode a Parte B novamente assim que possível.' as resultado;
