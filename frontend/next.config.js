/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    // Auth0テナントドメインはシークレットではない（Universal LoginのURL自体に露出する）。
    // SCIM Endpoint URLをクライアント側（/settings/identity-providers）で組み立てるために公開する。
    NEXT_PUBLIC_AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
    // ID Tokenのロールカスタムクレームのnamespace（例: https://nexuscrm.com、パス部分の
    // /rolesはsrc/lib/roles.ts側で固定で付与する）。namespace自体は非シークレットで、
    // サイドバー（Client Component）がロールに応じてメニュー表示を切り替えるために公開する。
    NEXT_PUBLIC_AUTH0_ROLES_NAMESPACE: process.env.AUTH0_ROLES_NAMESPACE,
  },
};

module.exports = nextConfig;
