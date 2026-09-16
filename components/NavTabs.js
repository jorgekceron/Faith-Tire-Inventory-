"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
const TABS = [
{ href: "/", label: "Home" },
{ href: "/inventory", label: "Inventory" },
{ href: "/tickets", label: "Job Tickets" },
{ href: "/orders", label: "Orders" },
{ href: "/sold", label: "Sold" },
{ href: "/settings", label: "Settings" },
];
export default function NavTabs() {
const pathname = usePathname();
const router = useRouter();
if (pathname === "/login") return null;
async function handleLogout() {
await supabase.auth.signOut();
router.replace("/login");
}
return (
<div className="nav-tabs">
<div className="nav-tabs-inner">
{TABS.map((t) => (
<Link key={t.href} href={t.href} className={"nav-tab" + (pathname === t.href ? " active" : "")}>
{t.label}
</Link>
))}
</div>
<button className="logout-btn" onClick={handleLogout}>Sign Out</button>
</div>
);
}
