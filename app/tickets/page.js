"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import PageSkeleton from "@/components/PageSkeleton";
import { sortCompare } from "@/lib/tireUtils";
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
const [tires, setTires] = useState([]);
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
const [pendingItems, setPendingItems] = useState([]);
const [pendingItemType, setPendingItemType] = useState("service");
const [pendingDescription, setPendingDescription] = useState("");
const [pendingQty, setPendingQty] = useState("1");
const [pendingUnitPrice, setPendingUnitPrice] = useState("");
const [pendingTireId, setPendingTireId] = useState("");
const [pendingExpandedServiceId, setPendingExpandedServiceId] = useState(null);
const [pendingSelectedAddonIds, setPendingSelectedAddonIds] = useState([]);
const [pendingItemError, setPendingItemError] = useState("");
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
.select("*, service_addons(*)")
.order("category", { ascending: true })
.order("name", { ascending: true });
if (!error) setServices(data || []);
}
async function loadTires() {
const { data, error } = await supabase
.from("tires")
.select("*");
if (!error) setTires((data || []).slice().sort(sortCompare));
}
useEffect(() => {
if (!session) return;
let active = true;
async function init() {
await Promise.all([loadTickets(), loadServices(), loadTires()]);
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
.on("postgres_changes", { event: "*", schema: "public", table: "service_addons" }, () => {
if (active) loadServices();
})
.subscribe();
const tiresChannel = supabase
.channel("tickets-tires-changes")
.on("postgres_changes", { event: "*", schema: "public", table: "tires" }, () => {
if (active) loadTires();
})
.subscribe();
return () => {
active = false;
supabase.removeChannel(ticketsChannel);
supabase.removeChannel(itemsChannel);
supabase.removeChannel(servicesChannel);
supabase.removeChannel(tiresChannel);
};
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [session]);
async function handleLogout() {
await supabase.auth.signOut();
router.replace("/login");
}
function pendingFillFromService(service) {
const addons = service.service_addons || [];
if (addons.length > 0 || service.notes) {
setPendingExpandedServiceId(pendingExpandedServiceId === service.id ? null : service.id);
setPendingSelectedAddonIds([]);
return;
}
setPendingItemType("service");
setPendingDescription(service.name);
setPendingUnitPrice(String(service.default_price));
}
function pendingToggleAddon(id) {
setPendingSelectedAddonIds((current) =>
current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
);
}
function pendingAddServiceWithAddons(service) {
const addons = service.service_addons || [];
const newItems = [
{ item_type: "service", description: service.name, quantity: 1, unit_price: Number(service.default_price) || 0 },
...addons
.filter((a) => pendingSelectedAddonIds.includes(a.id))
.map((a) => ({ item_type: "service", description: a.name, quantity: 1, unit_price: Number(a.price) || 0 })),
];
setPendingItems((current) => [...current, ...newItems]);
setPendingExpandedServiceId(null);
setPendingSelectedAddonIds([]);
}
function pendingHandleTireSelect(id) {
setPendingTireId(id);
const tire = tires.find((t) => String(t.id) === String(id));
if (tire) {
setPendingDescription(tire.size + (tire.location ? " (Loc " + tire.location + ")" : ""));
const n = parseFloat(String(tire.price).replace(/[^0-9.]/g, ""));
setPendingUnitPrice(isNaN(n) ? "" : String(n));
}
}
function pendingAddItem() {
setPendingItemError("");
const desc = pendingDescription.trim();
if (!desc) {
setPendingItemError("Description is required.");
return;
}
let qty = parseInt(pendingQty, 10);
if (isNaN(qty) || qty < 1) qty = 1;
let price = parseFloat(pendingUnitPrice);
if (isNaN(price) || price < 0) price = 0;
const item = { item_type: pendingItemType, description: desc, quantity: qty, unit_price: price };
if (pendingItemType === "tire" && pendingTireId) item.tireId = pendingTireId;
setPendingItems((current) => [...current, item]);
setPendingDescription("");
setPendingQty("1");
setPendingUnitPrice("");
setPendingTireId("");
}
function pendingRemoveItem(index) {
setPendingItems((current) => current.filter((_, i) => i !== index));
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
const { data: ticket, error } = await supabase
.from("job_tickets")
.insert({ customer_id: customerId, status: "Open", notes: fNotes.trim() })
.select()
.single();
if (error) {
setFormError("Couldn't create ticket: " + error.message);
return;
}
for (const item of pendingItems) {
await supabase.from("job_ticket_items").insert({
ticket_id: ticket.id,
item_type: item.item_type,
description: item.description,
quantity: item.quantity,
unit_price: item.unit_price,
});
if (item.tireId) {
await supabase.from("tires").delete().eq("id", item.tireId);
}
}
setFName("");
setFPhone("");
setFVehicle("");
setFNotes("");
setPendingItems([]);
showToast("Ticket created");
loadTickets();
}
async function handleStatusChange(ticketId, status) {
const ticket = tickets.find((t) => t.id === ticketId);
const { error } = await supabase.from("job_tickets").update({ status }).eq("id", ticketId);
if (error) {
showToast("Couldn't update status — try again");
return;
}
if (status === "Paid" && ticket && ticket.status !== "Paid") {
const tireItems = (ticket.job_ticket_items || []).filter((i) => i.item_type === "tire");
if (tireItems.length > 0) {
await supabase.from("sold_items").insert(
tireItems.map((i) => ({
size: i.description,
price: String(i.unit_price),
}))
);
}
}
loadTickets();
}
async function handleEditCustomer(customerId, updates) {
const { error } = await supabase.from("customers").update(updates).eq("id", customerId);
if (error) {
showToast("Couldn't save customer — try again");
return;
}
loadTickets();
}
async function handleEditItem(itemId, updates) {
const { error } = await supabase.from("job_ticket_items").update(updates).eq("id", itemId);
if (error) {
showToast("Couldn't save item — try again");
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
if (item.tireId) {
await supabase.from("tires").delete().eq("id", item.tireId);
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
return <PageSkeleton cards={4} />;
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
<div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 4 }}>
<div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--paper-dim)", marginBottom: 8 }}>
Add services or tires (optional) &mdash; you can also add these after creating the ticket
</div>
<div className="flags-row" style={{ marginBottom: 10 }}>
{services.map((s) => (
<button
key={s.id}
type="button"
className={"flag-toggle" + (pendingExpandedServiceId === s.id ? " active New" : "")}
onClick={() => pendingFillFromService(s)}
title={(s.service_addons || []).length > 0 || s.notes ? "Show options for: " + s.name : "Fill in: " + s.name}
>
{s.name}
</button>
))}
</div>
{pendingExpandedServiceId !== null && services.find((s) => s.id === pendingExpandedServiceId) && (() => {
const svc = services.find((s) => s.id === pendingExpandedServiceId);
const addons = svc.service_addons || [];
return (
<div className="settings-panel" style={{ marginBottom: 12, maxWidth: "none" }}>
<div style={{ fontWeight: 600, marginBottom: 6 }}>{svc.name} &middot; {money(svc.default_price)}</div>
{svc.notes && <div className="order-notes" style={{ marginBottom: 10 }}>{svc.notes}</div>}
{addons.length > 0 && (
<div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
{addons.map((a) => (
<label key={a.id} className="flag-chip" style={{ fontSize: 13 }}>
<input
type="checkbox"
checked={pendingSelectedAddonIds.includes(a.id)}
onChange={() => pendingToggleAddon(a.id)}
/>
{a.name} (+{money(a.price)})
</label>
))}
</div>
)}
<div style={{ display: "flex", gap: 8 }}>
<button className="add-btn" onClick={() => pendingAddServiceWithAddons(svc)}>+ Add to List</button>
<button className="cancel-btn" onClick={() => setPendingExpandedServiceId(null)}>Cancel</button>
</div>
</div>
);
})()}
<div className="add-form add-form-item-row">
<div className="field-sm">
<label>Type</label>
<select value={pendingItemType} onChange={(e) => { setPendingItemType(e.target.value); setPendingTireId(""); setPendingDescription(""); setPendingUnitPrice(""); }}>
<option value="service">Service</option>
<option value="tire">Tire</option>
</select>
</div>
{pendingItemType === "tire" ? (
<div className="field-sm">
<label>Pick from Inventory</label>
<select value={pendingTireId} onChange={(e) => pendingHandleTireSelect(e.target.value)}>
<option value="">Choose a tire&hellip;</option>
{tires.map((t) => (
<option key={t.id} value={t.id}>
{t.size} &middot; Rim {t.rim}&Prime; &middot; Loc {t.location ?? "—"}{t.price ? " · " + t.price : ""}
</option>
))}
</select>
</div>
) : (
<div className="field-sm">
<label>Description</label>
<input type="text" placeholder="e.g. 225/60/17 mount" value={pendingDescription} onChange={(e) => setPendingDescription(e.target.value)} />
</div>
)}
<div className="field-sm">
<label>Qty</label>
<input type="number" min="1" value={pendingQty} onChange={(e) => setPendingQty(e.target.value)} />
</div>
<div className="field-sm">
<label>Price ($)</label>
<input type="number" min="0" step="0.01" value={pendingUnitPrice} onChange={(e) => setPendingUnitPrice(e.target.value)} />
</div>
<button className="add-btn" onClick={pendingAddItem}>+ Add to List</button>
{pendingItemError && <div className="inline-error">{pendingItemError}</div>}
</div>
{pendingItems.length > 0 && (
<div style={{ marginTop: 12 }}>
{pendingItems.map((item, i) => (
<div key={i} className="row" style={{ gridTemplateColumns: "1fr auto auto" }}>
<div className="size-wrap">
<span className={"badge " + (item.item_type === "tire" ? "Pair" : "New")}>
{item.item_type === "tire" ? "Tire" : "Service"}
</span>
<span className="size-text">{item.description} &times;{item.quantity}</span>
</div>
<div className="loc">{money(item.unit_price * item.quantity)}</div>
<div className="row-actions">
<button className="del-btn" onClick={() => pendingRemoveItem(i)}>Remove</button>
</div>
</div>
))}
<div style={{ textAlign: "right", marginTop: 6, fontWeight: 700, fontSize: 13 }}>
Total: {money(pendingItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0))}
</div>
</div>
)}
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
tires={tires}
expanded={expandedId === ticket.id}
onToggle={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
onStatusChange={handleStatusChange}
onDelete={() => handleDeleteTicket(ticket.id)}
onAddItem={(item) => handleAddItem(ticket.id, item)}
onRemoveItem={handleRemoveItem}
onEditItem={handleEditItem}
onEditCustomer={handleEditCustomer}
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
function TicketCard({ ticket, services, tires, expanded, onToggle, onStatusChange, onDelete, onAddItem, onRemoveItem, onEditItem, onEditCustomer, onPrint }) {
const [itemType, setItemType] = useState("service");
const [description, setDescription] = useState("");
const [quantity, setQuantity] = useState("1");
const [unitPrice, setUnitPrice] = useState("");
const [itemError, setItemError] = useState("");
const [selectedTireId, setSelectedTireId] = useState("");
const [expandedServiceId, setExpandedServiceId] = useState(null);
const [selectedAddonIds, setSelectedAddonIds] = useState([]);
const [editingCustomer, setEditingCustomer] = useState(false);
const [editingItemId, setEditingItemId] = useState(null);
const total = ticketTotal(ticket);
const statusClass = "status-" + ticket.status.toLowerCase();
const customer = ticket.customers;
function fillFromService(service) {
const addons = service.service_addons || [];
if (addons.length > 0 || service.notes) {
setExpandedServiceId(expandedServiceId === service.id ? null : service.id);
setSelectedAddonIds([]);
return;
}
setItemType("service");
setDescription(service.name);
setUnitPrice(String(service.default_price));
}
function toggleAddon(id) {
setSelectedAddonIds((current) =>
current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
);
}
function addServiceWithAddons(service) {
onAddItem({ item_type: "service", description: service.name, quantity: 1, unit_price: Number(service.default_price) || 0 });
const addons = service.service_addons || [];
addons
.filter((a) => selectedAddonIds.includes(a.id))
.forEach((a) => {
onAddItem({ item_type: "service", description: a.name, quantity: 1, unit_price: Number(a.price) || 0 });
});
setExpandedServiceId(null);
setSelectedAddonIds([]);
}
function handleTireSelect(id) {
setSelectedTireId(id);
const tire = tires.find((t) => String(t.id) === String(id));
if (tire) {
setDescription(tire.size + (tire.location ? " (Loc " + tire.location + ")" : ""));
setUnitPrice(tire.price ? String(parsePriceFallback(tire.price)) : "");
}
}
function parsePriceFallback(p) {
const n = parseFloat(String(p).replace(/[^0-9.]/g, ""));
return isNaN(n) ? "" : n;
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
const payload = { item_type: itemType, description: desc, quantity: qty, unit_price: price };
if (itemType === "tire" && selectedTireId) payload.tireId = selectedTireId;
onAddItem(payload);
setDescription("");
setQuantity("1");
setUnitPrice("");
setSelectedTireId("");
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
<button className="tool-btn" onClick={() => setEditingCustomer((x) => !x)}>Edit Info</button>
<button className="tool-btn" onClick={onPrint} style={{ padding: "5px 10px", fontSize: 9 }}>🖨 Print</button>
<button className="del-btn" onClick={onDelete}>Delete</button>
</div>
</div>
{editingCustomer && (
<CustomerEditForm
customer={customer}
onCancel={() => setEditingCustomer(false)}
onSave={(updates) => {
if (customer) onEditCustomer(ticket.customer_id, updates);
setEditingCustomer(false);
}}
/>
)}
{expanded && (
<div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
{(ticket.job_ticket_items || []).length > 0 && (
<div style={{ marginBottom: 12 }}>
{ticket.job_ticket_items.map((item) =>
editingItemId === item.id ? (
<EditableTicketItemRow
key={item.id}
item={item}
onCancel={() => setEditingItemId(null)}
onSave={(updates) => {
onEditItem(item.id, updates);
setEditingItemId(null);
}}
/>
) : (
<div key={item.id} className="row" style={{ gridTemplateColumns: "1fr auto auto" }}>
<div className="size-wrap">
<span className={"badge " + (item.item_type === "tire" ? "Pair" : "New")}>
{item.item_type === "tire" ? "Tire" : "Service"}
</span>
<span className="size-text">{item.description} &times;{item.quantity}</span>
</div>
<div className="loc">{money(item.unit_price * item.quantity)}</div>
<div className="row-actions">
<button className="edit-btn" onClick={() => setEditingItemId(item.id)}>Edit</button>
<button className="del-btn" onClick={() => onRemoveItem(item.id)}>Remove</button>
</div>
</div>
)
)}
</div>
)}
<div className="flags-row" style={{ marginBottom: 10 }}>
{services.map((s) => (
<button
key={s.id}
type="button"
className={"flag-toggle" + (expandedServiceId === s.id ? " active New" : "")}
onClick={() => fillFromService(s)}
title={(s.service_addons || []).length > 0 || s.notes ? "Show options for: " + s.name : "Fill in: " + s.name}
>
{s.name}
</button>
))}
</div>
{expandedServiceId !== null && services.find((s) => s.id === expandedServiceId) && (() => {
const svc = services.find((s) => s.id === expandedServiceId);
const addons = svc.service_addons || [];
return (
<div className="settings-panel" style={{ marginBottom: 12, maxWidth: "none" }}>
<div style={{ fontWeight: 600, marginBottom: 6 }}>{svc.name} &middot; {money(svc.default_price)}</div>
{svc.notes && <div className="order-notes" style={{ marginBottom: 10 }}>{svc.notes}</div>}
{addons.length > 0 && (
<div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
{addons.map((a) => (
<label key={a.id} className="flag-chip" style={{ fontSize: 13 }}>
<input
type="checkbox"
checked={selectedAddonIds.includes(a.id)}
onChange={() => toggleAddon(a.id)}
/>
{a.name} (+{money(a.price)})
</label>
))}
</div>
)}
<div style={{ display: "flex", gap: 8 }}>
<button className="add-btn" onClick={() => addServiceWithAddons(svc)}>+ Add to Ticket</button>
<button className="cancel-btn" onClick={() => setExpandedServiceId(null)}>Cancel</button>
</div>
</div>
);
})()}
<div className="add-form add-form-item-row" style={{ marginBottom: 0 }}>
<div className="field-sm">
<label>Type</label>
<select value={itemType} onChange={(e) => { setItemType(e.target.value); setSelectedTireId(""); setDescription(""); setUnitPrice(""); }}>
<option value="service">Service</option>
<option value="tire">Tire</option>
</select>
</div>
{itemType === "tire" ? (
<div className="field-sm">
<label>Pick from Inventory</label>
<select value={selectedTireId} onChange={(e) => handleTireSelect(e.target.value)}>
<option value="">Choose a tire&hellip;</option>
{tires.map((t) => (
<option key={t.id} value={t.id}>
{t.size} &middot; Rim {t.rim}&Prime; &middot; Loc {t.location ?? "—"}{t.price ? " · " + t.price : ""}
</option>
))}
</select>
</div>
) : (
<div className="field-sm">
<label>Description</label>
<input type="text" placeholder="e.g. 225/60/17 mount" value={description} onChange={(e) => setDescription(e.target.value)} />
</div>
)}
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
function CustomerEditForm({ customer, onCancel, onSave }) {
const [name, setName] = useState(customer ? customer.name : "");
const [phone, setPhone] = useState(customer ? customer.phone || "" : "");
const [vehicle, setVehicle] = useState(customer ? customer.vehicle_info || "" : "");
const [err, setErr] = useState("");
function save() {
const trimmed = name.trim();
if (!trimmed) {
setErr("Customer name is required.");
return;
}
onSave({ name: trimmed, phone: phone.trim(), vehicle_info: vehicle.trim() });
}
return (
<div className="settings-panel" style={{ marginTop: 12, maxWidth: "none" }}>
<div className="add-form" style={{ gridTemplateColumns: "1.2fr 1fr 1.2fr", marginBottom: 0 }}>
<div className="field-sm">
<label>Customer name *</label>
<input type="text" value={name} onChange={(e) => setName(e.target.value)} />
</div>
<div className="field-sm">
<label>Phone</label>
<input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
</div>
<div className="field-sm">
<label>Vehicle</label>
<input type="text" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
</div>
{err && <div className="inline-error">{err}</div>}
</div>
<div className="edit-actions" style={{ marginTop: 10 }}>
<button className="cancel-btn" onClick={onCancel}>Cancel</button>
<button className="save-btn" onClick={save}>Save Changes</button>
</div>
</div>
);
}
function EditableTicketItemRow({ item, onCancel, onSave }) {
const [description, setDescription] = useState(item.description);
const [quantity, setQuantity] = useState(String(item.quantity));
const [unitPrice, setUnitPrice] = useState(String(item.unit_price));
const [err, setErr] = useState("");
function save() {
const desc = description.trim();
if (!desc) {
setErr("Description is required.");
return;
}
let qty = parseInt(quantity, 10);
if (isNaN(qty) || qty < 1) qty = 1;
let price = parseFloat(unitPrice);
if (isNaN(price) || price < 0) price = 0;
onSave({ description: desc, quantity: qty, unit_price: price });
}
return (
<div className="row editing" style={{ gridTemplateColumns: "1fr" }}>
<div className="edit-form" style={{ gridTemplateColumns: "1.6fr 0.6fr 0.7fr" }}>
<div className="field-sm">
<label>Description</label>
<input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
</div>
<div className="field-sm">
<label>Qty</label>
<input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
</div>
<div className="field-sm">
<label>Price ($)</label>
<input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
</div>
</div>
{err && <div className="inline-error">{err}</div>}
<div className="edit-actions">
<button className="cancel-btn" onClick={onCancel}>Cancel</button>
<button className="save-btn" onClick={save}>Save</button>
</div>
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
