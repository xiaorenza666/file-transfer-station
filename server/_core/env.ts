export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET || "dev_secret_fallback_for_local_development_only_do_not_use_in_prod",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Default LLM model for Forge API, e.g. "claude-sonnet-4.5" or "claude-3.5-sonnet"
  defaultLlmModel: process.env.DEFAULT_LLM_MODEL ?? "",
  
  // S3 Configuration
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "auto",
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    publicUrl: process.env.S3_PUBLIC_URL, // Optional: for public access if different from endpoint
  }
};
