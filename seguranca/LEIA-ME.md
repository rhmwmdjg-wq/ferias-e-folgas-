# Segurança do Atlas Saúde — roteiro

O login passa a ser feito pelo **Supabase Auth** e o banco passa a conferir o
perfil (admin, gestor ou servidor) em cada consulta. Todos continuam entrando
com o mesmo usuário/matrícula e a mesma senha de hoje.

## Ordem — não pule etapas

| # | O que fazer | Onde | Efeito |
|---|-------------|------|--------|
| 1 | Rodar `A_contas_de_login.sql` | Supabase > SQL Editor | Cria as contas de login. Não muda nada no sistema atual. |
| 2 | Testar o sistema novo no link de prévia do Vercel | Navegador | Entrar como admin, como gestor e como servidor. |
| 3 | Aprovar (merge) o Pull Request | GitHub | O sistema novo vai ao ar. |
| 4 | Rodar `B_fechar_o_banco.sql` | Supabase > SQL Editor | Fecha o banco. A partir daqui, sem login não se lê nada. |
| 5 | Dias depois: rodar `C_apagar_senhas_antigas.sql` | Supabase > SQL Editor | Apaga as senhas antigas das tabelas. Sem volta. |

Entre as etapas 1 e 3, evite trocar senhas ou cadastrar gestores no sistema
antigo: a mudança não chegaria às contas novas. Se acontecer, redefina a
senha da pessoa pelo sistema novo.

Se, depois da etapa 4, o sistema parar e for preciso voltar a trabalhar na
hora, `Z_emergencia_reabrir.sql` reabre o banco como era antes. É um remendo:
o banco volta a ficar exposto até a Parte B ser rodada de novo.

## O que testar na etapa 2

- Entrar como **admin** com a senha atual.
- Entrar como um **gestor** e conferir se os módulos dele aparecem.
- Entrar como um **servidor** (matrícula e senha): o sistema deve pedir uma
  senha nova no primeiro acesso.
- Em **Servidores**, usar o botão 🔑 para dar uma senha provisória a alguém
  que ainda não tem acesso.
- **Trocar Senha** (rodapé do menu) e entrar de novo com a senha nova.
- **Sair do Sistema** e confirmar que a tela de login volta.

## O que muda para quem usa

- Quem estava com senha antiga em texto puro (a maioria dos servidores) será
  obrigado a criar uma senha pessoal no primeiro acesso.
- Senha nova: mínimo de 6 caracteres, e não pode ser sequência óbvia.
- A senha de um servidor é definida pela gestão no botão 🔑 da lista de
  servidores; a de um gestor, pelo admin em **Gerenciar Gestores**.
- Ao sair, os dados guardados no navegador são apagados (importante em
  computador compartilhado).
- O link `?modulo=oficios` (gerador de ofícios em tela cheia) agora pede
  login da gestão. Os links de ofício, notificação e comprovante já emitidos
  continuam abrindo sem login.
- Sem internet não é possível fazer login (quem já está dentro continua).

## O que este trabalho não cobre

- As restrições de **setor e módulo por gestor** continuam valendo só na
  tela. No banco, qualquer gestor logado alcança os dados de gestão.
- Os arquivos já enviados (logos, fotos, PDFs de veículos) seguem acessíveis
  para quem tiver o link direto do arquivo.
- A senha de "reabrir ponto" continua escrita no código da página.
