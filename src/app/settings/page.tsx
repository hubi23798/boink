import { requirePageAuth } from "@/app/lib/require-auth";

const items = [
  {
    href: "/settings/connections",
    label: "Connections",
    description: "Link banks for automatic sync",
  },
  { href: "/settings/import", label: "Import CSV", description: "Upload Revolut CSV exports" },
  { href: "/settings/accounts", label: "Accounts", description: "Rename, archive, set liquidity" },
  { href: "/settings/categories", label: "Categories", description: "Manage spending categories" },
  { href: "/settings/rules", label: "Rules", description: "Auto-categorization rules" },
  { href: "/settings/profile", label: "Profile", description: "Currency, locale, risk tolerance" },
  {
    href: "/settings/passkeys",
    label: "Passkeys",
    description: "Register devices for passwordless sign-in",
  },
  { href: "/settings/sessions", label: "Sessions", description: "Active sessions and sign-out" },
];

export default async function SettingsPage() {
  await requirePageAuth();

  return (
    <div className="space-y-6 px-6 py-8">
      <h1 className="text-xl font-semibold text-[#F7F4EE]">Settings</h1>
      <div className="divide-y divide-[#4A2E1A] overflow-hidden rounded-xl border border-[#4A2E1A] bg-[#3A2414] text-sm">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[#4A2E1A]"
          >
            <div>
              <p className="font-medium text-[#F7F4EE]">{item.label}</p>
              <p className="text-xs text-[#C4B8A8]">{item.description}</p>
            </div>
            <span className="text-[#6B5040]">→</span>
          </a>
        ))}
      </div>
    </div>
  );
}
