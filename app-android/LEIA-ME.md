# Atlas Atestados (Android)

Aplicativo que abre a tela `app-atestado.html` do Atlas Saúde (envio de atestados ao RH com scanner).

- O APK é compilado pelo GitHub Actions (`.github/workflows/app-android.yml`) e publicado em
  **Releases → Atlas Atestados (Android)**. Download direto:
  https://github.com/rhmwmdjg-wq/ferias-e-folgas-/releases/latest/download/AtlasAtestados.apk
- As telas e regras ficam em `app-atestado.html`, `app-atestado.js` e `app-atestado.css` (na raiz do site).
  Alterar esses arquivos atualiza o app na hora, sem instalar de novo.
- Só é preciso gerar um APK novo quando mudar algo desta pasta (nome, ícone, permissões).
- `assinatura/atlas-debug.keystore` mantém a mesma assinatura entre versões, para o Android aceitar a atualização
  sem desinstalar.
