import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Generic rules — apply everywhere.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Domain-layer guardrail: forbid next/* imports inside src/lib/**.
    // Route handlers (src/app/**) and the proxy (src/proxy.ts; Next 16
    // renamed middleware.ts to proxy.ts) are allowed to use next/*. The
    // cookies adapter at src/lib/auth/cookies.ts is the deliberate
    // framework seam — explicitly excused below.
    files: ["src/lib/**/*.ts"],
    ignores: ["src/lib/auth/cookies.ts", "src/lib/supabase/server.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next/*"],
              message:
                "Domain layer must stay framework-free. Allowed in src/app/**, src/proxy.ts, and src/lib/auth/cookies.ts only.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "src/lib/db/migrations/**", ".claude/**"],
  },
];

export default config;
