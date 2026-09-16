"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
const TICKET_STATUSES = ["Open", "Completed", "Paid"];
function money(n) {
const num = Number(n) || 0;
return "$" + num.toFixed(2);
}
function ticketTotal(ticket) {
return (ticket.job_ticket_items || []).reduce(
(sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0),
0
);
}
export default function TicketsPage() {
const router = useRouter();
const [session, setSession] = useState(undefined);
const [tickets, setTickets] = useState([]);
const [services, setServices] = useState([]);
const [loaded, setLoaded] = useState(false);
const [toast, setToast] = useState("");
const toastTimer = useRef(null);
const [statusFilter, setStatusFilter] = useState("All");
const [expandedId, setExpandedId] = useState(null);
const [printTicketId, setPrintTicketId] = useState(null);
const [fName, setFName] = useState("");
const [fPhone, setFPhone] = useState("");
const [fVehicle, setFVehicle] = useState("");
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
function showToast(msg) {
setToast(msg);
clearTimeout(toastTimer.current);
toastTimer.current = setTimeout(() => setToast(""), 2200);
}
async function loadTickets() {
const { data, error } = await supabase
.from("job_tickets")
.select("*, customers(name, phone, vehicle_info), job_ticket_items(*)")
.order("created_at", { ascending: false });
if (error) {
showToast("Couldn't load job tickets — check your connection");
console.error(error);
return;
}
setTickets(data || []);
}
async function loadServices() {
const { data, error } = await supabase
.from("services")
.select("*")
.order("category", { ascending: true })
.order("name", { ascending: true });
if (!error) setServices(data || []);
}
useEffect(() => {
if (!session) return;
let active = true;
async function init() {
await Promise.all([loadTickets(), loadServices()]);
if (active) setLoaded(true);
}
init();
const ticketsChannel = supabase
.channel("job-tickets-changes")
.on("postgres_changes", { event: "*", schema: "public", table: "job_tickets" }, () => {
if (active) loadTickets();
})
.subscribe();
const itemsChannel = supabase
.channel("job-ticket-items-changes")
.on("postgres_changes", { event: "*", schema: "public", table: "job_ticket_items" }, () => {
if (active) loadTickets();
})
.subscribe();
const servicesChannel = supabase
.channel("services-changes")
.on("postgres_changes", { event: "*", schema: "public", table: "services" }, () => {
if (active) loadServices();
})
.subscribe();
return () => {
active = false;
supabase.removeChannel(ticketsChannel);
supabase.removeChannel(itemsChannel);
supabase.removeChannel(servicesChannel);
};
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [session]);
async function handleLogout() {
await supabase.auth.signOut();
router.replace("/login");
}
async function handleCreateTicket() {
setFormError("");
const name = fName.trim();
if (!name) {
setFormError("Customer name is required.");
return;
}
const phone = fPhone.trim();
const vehicle = fVehicle.trim();
// Find an existing customer by name + phone, or create one.
let customerId = null;
const { data: existing } = await supabase
.from("customers")
.select("id")
.eq("name", name)
.eq("phone", phone)
.maybeSingle();
if (existing) {
customerId = existing.id;
} else {
const { data: created, error: custError } = await supabase
.from("customers")
.insert({ name, phone, vehicle_info: vehicle })
.select()
.single();
if (custError) {
setFormError("Couldn't save customer: " + custError.message);
return;
}
customerId = created.id;
}
const { error } = await supabase
.from("job_tickets")
.insert({ customer_id: customerId, status: "Open", notes: fNotes.trim() });
if (error) {
setFormError("Couldn't create ticket: " + error.message);
return;
}
setFName("");
setFPhone("");
setFVehicle("");
setFNotes("");
showToast("Ticket created");
loadTickets();
}
async function handleStatusChange(ticketId, status) {
const { error } = await supabase.from("job_tickets").update({ status }).eq("id", ticketId);
if (error) {
showToast("Couldn't update status — try again");
return;
}
loadTickets();
}
async function handleDeleteTicket(ticketId) {
const { error } = await supabase.from("job_tickets").delete().eq("id", ticketId);
if (error) {
showToast("Couldn't delete ticket — try again");
return;
}
showToast("Ticket deleted");
loadTickets();
}
async function handleAddItem(ticketId, item) {
const { error } = await supabase.from("job_ticket_items").insert({
ticket_id: ticketId,
item_type: item.item_type,
description: item.description,
quantity: item.quantity,
unit_price: item.unit_price,
});
if (error) {
showToast("Couldn't add item — try again");
return;
}
loadTickets();
}
async function handleRemoveItem(itemId) {
const { error } = await supabase.from("job_ticket_items").delete().eq("id", itemId);
if (error) {
showToast("Couldn't remove item — try again");
return;
}
loadTickets();
}
function handlePrintTicket(ticketId) {
setPrintTicketId(ticketId);
setTimeout(() => window.print(), 50);
}
const filteredTickets = useMemo(() => {
if (statusFilter === "All") return tickets;
return tickets.filter((t) => t.status === statusFilter);
}, [tickets, statusFilter]);
const printTicket = useMemo(
() => tickets.find((t) => t.id === printTicketId) || null,
[tickets, printTicketId]
);
if (session === undefined || !loaded) {
return <div className="loading-screen">Loading job tickets&hellip;</div>;
}
return (
<div className="page">
<div className="header">
<div>
<div className="brand"><span className="dot" />Job Tickets</div>
<div className="sub">Mounts, tire sales, and shop services &mdash; one ticket per visit</div>
</div>
<div className="header-right">
<div className="count"><b>{tickets.length}</b> tickets on file</div>
</div>
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
<label>Vehicle</label>
<input type="text" placeholder="e.g. 2018 Civic (optional)" value={fVehicle} onChange={(e) => setFVehicle(e.target.value)} />
</div>
<div className="field-sm" style={{ gridColumn: "1 / -1" }}>
<label>Notes</label>
<input type="text" placeholder="(optional)" value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
</div>
<button className="add-btn" onClick={handleCreateTicket}>+ New Ticket</button>
{formError && <div className="inline-error">{formError}</div>}
</div>
<div className="order-filter-row">
<span className="order-filter-label">Filter:</span>
{["All", ...TICKET_STATUSES].map((s) => (
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
{filteredTickets.length === 0 ? (
<div className="empty">No tickets match this filter</div>
) : (
filteredTickets.map((ticket) => (
<TicketCard
key={ticket.id}
ticket={ticket}
services={services}
expanded={expandedId === ticket.id}
onToggle={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
onStatusChange={handleStatusChange}
onDelete={() => handleDeleteTicket(ticket.id)}
onAddItem={(item) => handleAddItem(ticket.id, item)}
onRemoveItem={handleRemoveItem}
onPrint={() => handlePrintTicket(ticket.id)}
/>
))
)}
</div>
<div className="footer">Shared cloud data &middot; synced live via Supabase for everyone signed in</div>
{/* Print-only invoice view for a single ticket */}
<div className="print-view">
{printTicket && <TicketInvoice ticket={printTicket} />}
</div>
<div className={"toast" + (toast ? " show" : "")}>{toast}</div>
</div>
);
}
function TicketCard({ ticket, services, expanded, onToggle, onStatusChange, onDelete, onAddItem, onRemoveItem, onPrint }) {
const [itemType, setItemType] = useState("service");
const [description, setDescription] = useState("");
const [quantity, setQuantity] = useState("1");
const [unitPrice, setUnitPrice] = useState("");
const [itemError, setItemError] = useState("");
const total = ticketTotal(ticket);
const statusClass = "status-" + ticket.status.toLowerCase();
const customer = ticket.customers;
function fillFromService(service) {
setItemType("service");
setDescription(service.name);
setUnitPrice(String(service.default_price));
}
function addItem() {
setItemError("");
const desc = description.trim();
if (!desc) {
setItemError("Description is required.");
return;
}
let qty = parseInt(quantity, 10);
if (isNaN(qty) || qty < 1) qty = 1;
let price = parseFloat(unitPrice);
if (isNaN(price) || price < 0) price = 0;
onAddItem({ item_type: itemType, description: desc, quantity: qty, unit_price: price });
setDescription("");
setQuantity("1");
setUnitPrice("");
}
return (
<div className={"order-row " + statusClass} style={{ flexDirection: "column", alignItems: "stretch" }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
<div className="order-main" style={{ cursor: "pointer" }} onClick={onToggle}>
<div className="order-customer">
Ticket #{ticket.ticket_number} &middot; {customer ? customer.name : "Unknown customer"}
</div>
<div className="order-details">
{customer && customer.phone && <>{customer.phone} &middot; </>}
{customer && customer.vehicle_info && <>{customer.vehicle_info} &middot; </>}
{(ticket.job_ticket_items || []).length} item{(ticket.job_ticket_items || []).length === 1 ? "" : "s"} &middot; Total {money(total)}
</div>
{ticket.notes && <div className="order-notes">{ticket.notes}</div>}
</div>
<div className="order-actions">
<select
className="status-select"
value={ticket.status}
onChange={(e) => onStatusChange(ticket.id, e.target.value)}
>
{TICKET_STATUSES.map((s) => (
<option key={s} value={s}>{s}</option>
))}
</select>
<button className="edit-btn" onClick={onToggle}>{expanded ? "Collapse" : "Details"}</button>
<button className="tool-btn" onClick={onPrint} style={{ padding: "5px 10px", fontSize: 9 }}>🖨 Print</button>
<button className="del-btn" onClick={onDelete}>Delete</button>
</div>
</div>
{expanded && (
<div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
{(ticket.job_ticket_items || []).length > 0 && (
<div style={{ marginBottom: 12 }}>
{ticket.job_ticket_items.map((item) => (
<div key={item.id} className="row" style={{ gridTemplateColumns: "1fr auto auto" }}>
<div className="size-wrap">
<span className={"badge " + (item.item_type === "tire" ? "Pair" : "New")}>
{item.item_type === "tire" ? "Tire" : "Service"}
</span>
<span className="size-text">{item.description} &times;{item.quantity}</span>
</div>
<div className="loc">{money(item.unit_price * item.quantity)}</div>
<div className="row-actions">
<button className="del-btn" onClick={() => onRemoveItem(item.id)}>Remove</button>
</div>
</div>
))}
</div>
)}
<div className="flags-row" style={{ marginBottom: 10 }}>
{services.map((s) => (
<button
key={s.id}
type="button"
className="flag-toggle"
onClick={() => fillFromService(s)}
title={"Fill in: " + s.name}
>
{s.name}
</button>
))}
</div>
<div className="add-form" style={{ gridTemplateColumns: "0.7fr 1.6fr 0.5fr 0.7fr auto", marginBottom: 0 }}>
<div className="field-sm">
<label>Type</label>
<select value={itemType} onChange={(e) => setItemType(e.target.value)}>
<option value="service">Service</option>
<option value="tire">Tire</option>
</select>
</div>
<div className="field-sm">
<label>Description</label>
<input type="text" placeholder="e.g. 225/60/17 mount" value={description} onChange={(e) => setDescription(e.target.value)} />
</div>
<div className="field-sm">
<label>Qty</label>
<input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
</div>
<div className="field-sm">
<label>Price ($)</label>
<input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
</div>
<button className="add-btn" onClick={addItem}>+ Add Item</button>
{itemError && <div className="inline-error">{itemError}</div>}
</div>
</div>
)}
</div>
);
}
function TicketInvoice({ ticket }) {
const total = ticketTotal(ticket);
const customer = ticket.customers;
return (
<div className="print-group">
<div className="print-title">Faith Tire Center &mdash; Job Ticket #{ticket.ticket_number}</div>
<div className="print-sub">
{customer ? customer.name : "Unknown customer"}
{customer && customer.phone ? " · " + customer.phone : ""}
{customer && customer.vehicle_info ? " · " + customer.vehicle_info : ""}
{" — "}
{new Date(ticket.created_at).toLocaleDateString()} &middot; Status: {ticket.status}
</div>
<table className="print-table">
<thead>
<tr>
<th>Type</th>
<th>Description</th>
<th>Qty</th>
<th>Unit Price</th>
<th>Line Total</th>
</tr>
</thead>
<tbody>
{(ticket.job_ticket_items || []).map((item) => (
<tr key={item.id}>
<td>{item.item_type === "tire" ? "Tire" : "Service"}</td>
<td>{item.description}</td>
<td>{item.quantity}</td>
<td>{money(item.unit_price)}</td>
<td>{money(item.unit_price * item.quantity)}</td>
</tr>
))}
</tbody>
</table>
<div style={{ textAlign: "right", marginTop: 10, fontWeight: 700, fontSize: 13 }}>
Total: {money(total)}
</div>
{ticket.notes && (
<div style={{ marginTop: 10, fontSize: 11, color: "#555" }}>Notes: {ticket.notes}</div>
)}
</div>
);
}
