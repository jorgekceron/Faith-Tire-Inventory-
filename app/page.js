"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { parsePrice } from "@/lib/tireUtils";
import PageSkeleton from "@/components/PageSkeleton";
export default function HomePage() {
const router = useRouter();
const [session, setSession] = useState(undefined);
const [loaded, setLoaded] = useState(false);
const [tireCount, setTireCount] = useState(0);
const [openTickets, setOpenTickets] = useState(0);
const [pendingOrders, setPendingOrders] = useState(0);
const [soldCount, setSoldCount] = useState(0);
const [soldRevenue, setSoldRevenue] = useState(0);
useEffect(() => {
let active = true;
supabase.auth.getSession().then(({ data }) => {
if (!active) return;
if (!data.session) {
router.replace("/login");
} else {
setSession(data.session);
}
});
return () => {
active = false;
};
}, [router]);
useEffect(() => {
if (!session) return;
let active = true;
async function load() {
const [tiresRes, ticketsRes, ordersRes, soldRes] = await Promise.all([
supabase.from("tires").select("id", { count: "exact", head: true }),
supabase.from("job_tickets").select("id", { count: "exact", head: true }).eq("status", "Open"),
supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "Pending"),
supabase.from("sold_items").select("price"),
]);
if (!active) return;
if (typeof tiresRes.count === "number") setTireCount(tiresRes.count);
if (typeof ticketsRes.count === "number") setOpenTickets(ticketsRes.count);
if (typeof ordersRes.count === "number") setPendingOrders(ordersRes.count);
const soldItems = soldRes.data || [];
setSoldCount(soldItems.length);
let revenue = 0;
soldItems.forEach((i) => {
const p = parsePrice(i.price);
if (p !== null) revenue += p;
});
setSoldRevenue(revenue);
setLoaded(true);
}
load();
return () => {
active = false;
};
}, [session]);
if (session === undefined || !loaded) {
return <PageSkeleton cards={4} />;
}
return (
<div className="page">
<div className="header">
<div>
<div className="brand"><span className="dot" />Faith Tire Center</div>
<div className="sub">Shop overview</div>
</div>
</div>
<div className="dash-grid">
<Link href="/inventory" className="dash-card">
<div className="dash-num">{tireCount}</div>
<div className="dash-label">Tires in Stock</div>
</Link>
<Link href="/tickets" className="dash-card">
<div className="dash-num">{openTickets}</div>
<div className="dash-label">Open Tickets</div>
</Link>
<Link href="/orders" className="dash-card">
<div className="dash-num">{pendingOrders}</div>
<div className="dash-label">Pending Orders</div>
</Link>
<Link href="/sold" className="dash-card">
<div className="dash-num">${soldRevenue.toFixed(2)}</div>
<div className="dash-label">Sold Total ({soldCount})</div>
</Link>
</div>
</div>
);
}
