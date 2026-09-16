"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { parsePrice } from "@/lib/tireUtils";
import PageSkeleton from "@/components/PageSkeleton";
export default function SoldPage() {
const router = useRouter();
const [session, setSession] = useState(undefined);
const [items, setItems] = useState([]);
const [loaded, setLoaded] = useState(false);
const [toast, setToast] = useState("");
const toastTimer = useRef(null);
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
const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
setSession(sess);
if (!sess) router.replace("/login");
});
return () => {
active = false;
listener.subscription.unsubscribe();
};
}, [router]);
useEffect(() => {
if (!session) return;
let active = true;
async function load() {
const { data, error } = await supabase
.from("sold_items")
.select("*")
.order("sold_at", { ascending: false });
if (!active) return;
if (error) {
showToast("Couldn't load sold report — check your connection");
console.error(error);
} else {
setItems(data || []);
}
setLoaded(true);
}
load();
const channel = supabase
.channel("sold-items-changes")
.on("postgres_changes", { event: "*", schema: "public", table: "sold_items" }, (payload) => {
setItems((current) => {
if (payload.eventType === "INSERT") {
if (current.some((i) => i.id === payload.new.id)) return current;
return [payload.new, ...current];
}
if (payload.eventType === "DELETE") {
return current.filter((i) => i.id !== payload.old.id);
}
return current;
});
})
.subscribe();
return () => {
active = false;
supabase.removeChannel(channel);
};
}, [session]);
function showToast(msg) {
setToast(msg);
clearTimeout(toastTimer.current);
toastTimer.current = setTimeout(() => setToast(""), 2200);
}
async function handleLogout() {
await supabase.auth.signOut();
router.replace("/login");
}
async function handleReset() {
const confirmed = window.confirm(
`This will permanently clear all ${items.length} entries from the sold report. This can't be undone. Continue?`
);
if (!confirmed) return;
const { error } = await supabase.from("sold_items").delete().gte("id", 0);
if (error) {
showToast("Couldn't reset the report — try again");
return;
}
setItems([]);
showToast("Sold report cleared");
}
function handlePrint() {
window.print();
}
const totalRevenue = useMemo(() => {
let sum = 0;
let anyPriced = false;
items.forEach((i) => {
const p = parsePrice(i.price);
if (p !== null) {
sum += p;
anyPriced = true;
}
});
return anyPriced ? sum : null;
}, [items]);
if (session === undefined || !loaded) {
return <PageSkeleton cards={3} />;
}
return (
<div className="page">
<div className="header">
<div>
<div className="brand"><span className="dot" />Sold Report</div>
<div className="sub">Tires marked sold from inventory &mdash; stays until you reset it</div>
</div>
<div className="header-right">
<div className="count">
<b>{items.length}</b> sold
{totalRevenue !== null && <> &middot; ${totalRevenue.toFixed(2)}</>}
</div>
</div>
</div>
<div className="toolbar">
<button className="tool-btn" onClick={handlePrint}>🖨 Print</button>
<button className="tool-btn danger-tool-btn" onClick={handleReset}>Reset Sold Report</button>
</div>
<div className="orders-list">
{items.length === 0 ? (
<div className="empty">No tires marked sold yet</div>
) : (
items.map((item) => (
<div className="order-row" key={item.id}>
<div className="order-main">
<div className="order-customer">{item.size}</div>
<div className="order-details">
{item.rim && <>Rim {item.rim}&Prime; &middot; </>}
{item.location ? <>Loc {item.location} &middot; </> : null}
Sold {new Date(item.sold_at).toLocaleString()}
</div>
{(item.flags || item.price) && (
<div className="order-notes">
{item.flags}
{item.flags && item.price ? " · " : ""}
{item.price}
</div>
)}
</div>
</div>
))
)}
</div>
<div className="footer">Shared cloud data &middot; synced live via Supabase for everyone signed in</div>
{/* Print-only view */}
<div className="print-view">
<div className="print-title">Faith Tire Center &mdash; Sold Report</div>
<div className="print-sub">
{items.length} sold{totalRevenue !== null ? ` \u00b7 Total: $${totalRevenue.toFixed(2)}` : ""}
</div>
<div className="print-group">
<table className="print-table">
<thead>
<tr>
<th>Tire Size</th>
<th>Rim</th>
<th>Location</th>
<th>Flags</th>
<th>Price</th>
<th>Sold At</th>
</tr>
</thead>
<tbody>
{items.map((item) => (
<tr key={item.id}>
<td>{item.size}</td>
<td>{item.rim ? item.rim + '"' : ""}</td>
<td>{item.location ?? ""}</td>
<td>{item.flags || ""}</td>
<td>{item.price || ""}</td>
<td>{new Date(item.sold_at).toLocaleString()}</td>
</tr>
))}
</tbody>
</table>
</div>
</div>
<div className={"toast" + (toast ? " show" : "")}>{toast}</div>
</div>
);
}
