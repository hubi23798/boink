import Link from "next/link";
import { requirePageAuth } from "@/app/lib/require-auth";
import { PasskeyRegisterButton } from "./passkey-register-button";

export default async function PasskeysSettingsPage() {
  await requirePageAuth();

  return (
    <div className="space-y-6 px-6 py-8">
      <div>
        <Link href="/settings" className="text-sm text-[#C4B8A8] hover:text-[#F7F4EE]">
          ← Settings
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-[#F7F4EE]">Passkeys</h1>
        <p className="mt-1 text-sm text-[#C4B8A8]">
          Register device passkeys for passwordless sign-in.
        </p>
      </div>
      <PasskeyRegisterButton />
    </div>
  );
}
