"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { ORDER_STATUSES } from "@/lib/tireUtils";
function money(n) {
const num = Number(n) || 0;
return "$" + num.toFixed(2);
}
export default function OrdersPage() {
const router = useRouter();
const [session, setSession] = useState(undefined);
const [orders, setOrders] = useState([]);
const [loaded, setLoaded] = useState(false);
const [toast, setToast] = useState("");
const toastTimer = useRef(null);
const [statusFilter, setStatusFilter] = useState("All");
const [editingId, setEditingId] = useState(null);
const [fName, setFName] = useState("");
const [fPhone, setFPhone] = useState("");
const [fSize, setFSize] = useState("");
const [fQty, setFQty] = useState("1");
const [fTotal, setFTotal] = useState("");
const [fDeposit, setFDeposit] = useState("");
const [fNotes, setFNotes] = useState("");
const [formError, setFormError] = useState("");
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
.from("orders")
.select("*")
.order("created_at", { ascending: false });
if (!active) return;
if (error) {
showToast("Couldn't load orders — check your connection");
console.error(error);
} else {
setOrders(data || []);
}
setLoaded(true);
}
load();
const channel = supabase
.channel("orders-changes")
.on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
setOrders((current) => {
if (payload.eventType === "INSERT") {
if (current.some((o) => o.id === payload.new.id)) return current;
return [payload.new, ...current];
}
if (payload.eventType === "UPDATE") {
return current.map((o) => (o.id === payload.new.id ? payload.new : o));
}
if (payload.eventType === "DELETE") {
return current.filter((o) => o.id !== payload.old.id);
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
async function handleAdd() {
setFormError("");
const customerName = fName.trim();
const size = fSize.trim();
if (!customerName) {
setFormError("Customer name is required.");
return;
}
if (!size) {
setFormError("Tire size is required.");
return;
}
let qty = parseInt(fQty, 10);
if (isNaN(qty) || qty < 1) qty = 1;
let total = parseFloat(fTotal);
if (isNaN(total) || total < 0) total = 0;
let deposit = parseFloat(fDeposit);
if (isNaN(deposit) || deposit < 0) deposit = 0;
const { data, error } = await supabase
.from("orders")
.insert({
customer_name: customerName,
phone: fPhone.trim(),
size,
quantity: qty,
status: "Pending",
notes: fNotes.trim(),
total_amount: total,
deposit_amount: deposit,
})
.select()
.single();
if (error) {
setFormError("Couldn't save: " + error.message);
return;
}
setOrders((current) => (current.some((o) => o.id === data.id) ? current : [data, ...current]));
setFName("");
setFPhone("");
setFSize("");
setFQty("1");
setFTotal("");
setFDeposit("");
setFNotes("");
showToast("Order added");
}
async function handleStatusChange(id, status) {
const { data, error } = await supabase
.from("orders")
.update({ status })
.eq("id", id)
.select()
.single();
if (error) {
showToast("Couldn't update status — try again");
return;
}
setOrders((current) => current.map((o) => (o.id === id ? data : o)));
}
async function handleDelete(id) {
const prev = orders;
setOrders((current) => current.filter((o) => o.id !== id));
const { error } = await supabase.from("orders").delete().eq("id", id);
if (error) {
setOrders(prev);
showToast("Couldn't remove order — try again");
}
}
async function handleSaveNotes(id, notes) {
const { data, error } = await supabase
.from("orders")
.update({ notes })
.eq("id", id)
.select()
.single();
if (error) {
showToast("Couldn't save notes — try again");
return;
}
setOrders((current) => current.map((o) => (o.id === id ? data : o)));
setEditingId(null);
}
const filteredOrders = useMemo(() => {
if (statusFilter === "All") return orders;
return orders.filter((o) => o.status === statusFilter);
}, [orders, statusFilter]);
function handlePrint() {
window.print();
}
if (session === undefined || !loaded) {
return <div className="loading-screen">Loading orders&hellip;</div>;
}
return (
<div className="page">
<div className="header">
<div>
<div className="brand"><span className="dot" />Customer Tire Orders</div>
<div className="sub">Special orders for tires not currently in stock</div>
</div>
<div className="header-right">
<div className="count"><b>{orders.length}</b> orders on file</div>
</div>
</div>
<div className="toolbar">
<button className="tool-btn" onClick={handlePrint}>🖨 Print</button>
</div>
<div className="add-form order-form">
<div className="field-sm">
<label>Customer name *</label>
<input type="text" placeholder="e.g. John Smith" value={fName} onChange={(e) => setFName(e.target.value)} />
</div>
<div className="field-sm">
<label>Phone</label>
<input type="text" placeholder="(optional)" value={fPhone} onChange={(e) => setFPhone(e.target.value)} />
</div>
<div className="field-sm">
<label>Tire size *</label>
<input type="text" placeholder="e.g. 225/60/17" value={fSize} onChange={(e) => setFSize(e.target.value)} />
</div>
<div className="field-sm">
<label>Quantity</label>
<input type="number" min="1" value={fQty} onChange={(e) => setFQty(e.target.value)} />
</div>
<div className="field-sm">
<label>Total Amount ($)</label>
<input type="number" min="0" step="0.01" placeholder="0.00" value={fTotal} onChange={(e) => setFTotal(e.target.value)} />
</div>
<div className="field-sm">
<label>Deposit Amount ($)</label>
<input type="number" min="0" step="0.01" placeholder="0.00" value={fDeposit} onChange={(e) => setFDeposit(e.target.value)} />
</div>
<div className="field-sm" style={{ gridColumn: "1 / -1" }}>
<label>Notes</label>
<input type="text" placeholder="(optional)" value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
</div>
<button className="add-btn" onClick={handleAdd}>+ Add Order</button>
{formError && <div className="inline-error">{formError}</div>}
</div>
<div className="order-filter-row">
<span className="order-filter-label">Filter:</span>
{["All", ...ORDER_STATUSES].map((s) => (
<button
key={s}
className={"status-filter-btn" + (statusFilter === s ? " active" : "")}
onClick={() => setStatusFilter(s)}
>
{s}
</button>
))}
</div>
<div className="orders-list">
{filteredOrders.length === 0 ? (
<div className="empty">No orders match this filter</div>
) : (
filteredOrders.map((order) => (
order.id === editingId ? (
<EditNotesRow key={order.id} order={order} onCancel={() => setEditingId(null)} onSave={handleSaveNotes} />
) : (
<OrderRow
key={order.id}
order={order}
onStatusChange={handleStatusChange}
onDelete={handleDelete}
onEdit={() => setEditingId(order.id)}
/>
)
)))}
</div>
<div className="footer">Shared cloud data &middot; synced live via Supabase for everyone signed in</div>
{/* Print-only view */}
<div className="print-view">
<div className="print-title">Faith Tire Center &mdash; Customer Orders</div>
<div className="print-sub">
{statusFilter === "All" ? "All statuses" : statusFilter} &middot; {filteredOrders.length} orders
</div>
<div className="print-group">
<table className="print-table">
<thead>
<tr>
<th>Customer</th>
<th>Phone</th>
<th>Tire Size</th>
<th>Qty</th>
<th>Total</th>
<th>Deposit</th>
<th>Balance</th>
<th>Status</th>
<th>Notes</th>
</tr>
</thead>
<tbody>
{filteredOrders.map((order) => (
<tr key={order.id}>
<td>{order.customer_name}</td>
<td>{order.phone || ""}</td>
<td>{order.size}</td>
<td>{order.quantity}</td>
<td>{money(order.total_amount)}</td>
<td>{money(order.deposit_amount)}</td>
<td>{money((order.total_amount || 0) - (order.deposit_amount || 0))}</td>
<td>{order.status}</td>
<td>{order.notes || ""}</td>
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
function OrderRow({ order, onStatusChange, onDelete, onEdit }) {
const statusClass = "status-" + order.status.replace(/\s+/g, "-").toLowerCase();
const balance = (Number(order.total_amount) || 0) - (Number(order.deposit_amount) || 0);
return (
<div className={"order-row " + statusClass}>
<div className="order-main">
<div className="order-customer">{order.customer_name}</div>
<div className="order-details">
{order.size} &middot; Qty {order.quantity}
{order.phone && <> &middot; {order.phone}</>}
</div>
<div className="order-details">
Total {money(order.total_amount)} &middot; Deposit {money(order.deposit_amount)} &middot; Balance {money(balance)}
</div>
{order.notes && <div className="order-notes">{order.notes}</div>}
</div>
<div className="order-actions">
<select
className="status-select"
value={order.status}
onChange={(e) => onStatusChange(order.id, e.target.value)}
>
{ORDER_STATUSES.map((s) => (
<option key={s} value={s}>{s}</option>
))}
</select>
<button className="edit-btn" onClick={onEdit}>Edit</button>
<button className="del-btn" onClick={() => onDelete(order.id)}>Remove</button>
</div>
</div>
);
}
function EditNotesRow({ order, onCancel, onSave }) {
const [notes, setNotes] = useState(order.notes || "");
return (
<div className="order-row">
<div className="order-main" style={{ width: "100%" }}>
<div className="order-customer">{order.customer_name}</div>
<div className="field-sm" style={{ marginTop: 8 }}>
<label>Notes</label>
<input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
</div>
</div>
<div className="edit-actions" style={{ marginTop: 0 }}>
<button className="cancel-btn" onClick={onCancel}>Cancel</button>
<button className="save-btn" onClick={() => onSave(order.id, notes.trim())}>Save</button>
</div>
</div>
);
}
