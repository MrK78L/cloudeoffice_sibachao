/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  readonly VITE_USE_DEMO_FALLBACK?: string;
  readonly VITE_BYPASS_ADMIN_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
