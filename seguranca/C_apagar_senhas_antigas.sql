-- =====================================================================
-- ATLAS SAÚDE — SEGURANÇA — PARTE C: APAGAR AS SENHAS ANTIGAS
-- =====================================================================
-- O que faz: remove as colunas "senha" das tabelas gestores e servidores.
-- As senhas passam a existir somente no login oficial do Supabase
-- (criptografadas), e não mais em tabela.
--
-- Rode alguns dias DEPOIS da Parte B, quando todos já estiverem entrando
-- normalmente com o novo login. NÃO TEM VOLTA.
--
-- Quem ainda não tem conta de login aparece na conferência abaixo: defina
-- uma senha para a pessoa pelo sistema (botão "Definir senha de acesso").
-- =====================================================================

-- Conferência ANTES de apagar: quem tinha senha mas ficou sem conta?
-- (o esperado é não aparecer ninguém)
do $$
declare
  v_faltando int;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'servidores' and column_name = 'senha') then
    raise notice 'Colunas já removidas.';
    return;
  end if;

  execute $q$
    select count(*) from (
      select public.atlas_email('gestores', g.id::text) as email
        from public.gestores g where coalesce(btrim(g.senha::text), '') <> ''
      union all
      select public.atlas_email('servidores', s.id::text)
        from public.servidores s where coalesce(btrim(s.senha::text), '') <> ''
    ) x
    where not exists (select 1 from auth.users u where u.email = x.email)
  $q$ into v_faltando;

  if v_faltando > 0 then
    raise exception '% cadastro(s) com senha ainda sem conta de login. Rode a Parte A de novo antes da Parte C.', v_faltando;
  end if;
end;
$$;

alter table public.gestores   drop column if exists senha;
alter table public.servidores drop column if exists senha;

select 'Senhas antigas removidas das tabelas.' as resultado;
