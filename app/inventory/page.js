"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
RIM_ORDER,
sortCompare,
detectRim,
normalizeSize,
matchesQuery,
buildSummaryText,
groupByLocation,
groupByFlag,
} from "@/lib/tireUtils";
function escapeHtml(s) {
return String(s).replace(/[&<>"']/g, (c) => ({
"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));
}
function highlightHtml(text, q) {
const safe = escapeHtml(text);
if (!q) return safe;
const idx = safe.toLowerCase().indexOf(q.toLowerCase());
if (idx === -1) return safe;
return safe.slice(0, idx) + "<mark>" + safe.slice(idx, idx + q.length) + "</mark>" + safe.slice(idx + q.length);
}
export default function InventoryPage() {
const router = useRouter();
const [session, setSession] = useState(undefined);
const [tires, setTires] = useState([]);
const [loaded, setLoaded] = useState(false);
const [search, setSearch] = useState("");
const [editingId, setEditingId] = useState(null);
const [lastAddedId, setLastAddedId] = useState(null);
const [toast, setToast] = useState("");
const toastTimer = useRef(null);
const [printMode, setPrintMode] = useState("size"); // "size" | "location" | "flag" | "full"
const [fSize, setFSize] = useState("");
const [fRim, setFRim] = useState("auto");
const [fLoc, setFLoc] = useState("");
const [fFlags, setFFlags] = useState({ New: false, Pair: false, Set: false });
const [fPrice, setFPrice] = useState("");
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
.from("tires")
.select("*")
.order("id", { ascending: true });
if (!active) return;
if (error) {
showToast("Couldn't load inventory — check your connection");
console.error(error);
} else {
setTires(data || []);
}
setLoaded(true);
}
load();
const channel = supabase
.channel("tires-changes")
.on("postgres_changes", { event: "*", schema: "public", table: "tires" }, (payload) => {
setTires((current) => {
if (payload.eventType === "INSERT") {
if (current.some((t) => t.id === payload.new.id)) return current;
return [...current, payload.new];
}
if (payload.eventType === "UPDATE") {
return current.map((t) => (t.id === payload.new.id ? payload.new : t));
}
if (payload.eventType === "DELETE") {
return current.filter((t) => t.id !== payload.old.id);
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
const rawSize = fSize.trim();
if (!rawSize) {
setFormError("Tire size is required.");
return;
}
let rim = fRim;
if (rim === "auto") {
rim = detectRim(rawSize);
if (!rim) {
setFormError(`Couldn't detect rim size from "${rawSize}" — pick a rim size manually.`);
return;
}
}
const locRaw = fLoc.trim();
if (locRaw === "") {
setFormError("Location is required.");
return;
}
const n = parseInt(locRaw, 10);
if (isNaN(n) || n < 1) {
setFormError("Location must be a positive number.");
return;
}
const location = String(n);
const flags = Object.entries(fFlags).filter(([, v]) => v).map(([k]) => k).join(", ");
const { data, error } = await supabase
.from("tires")
.insert({
size: normalizeSize(rawSize),
rim,
location,
flags,
price: fPrice.trim(),
})
.select()
.single();
if (error) {
setFormError("Couldn't save: " + error.message);
return;
}
setTires((current) => (current.some((t) => t.id === data.id) ? current : [...current, data]));
setLastAddedId(data.id);
setTimeout(() => setLastAddedId(null), 1700);
setFSize("");
setFLoc("");
setFPrice("");
setFFlags({ New: false, Pair: false, Set: false });
setFRim("auto");
}
async function handleDelete(id) {
const prev = tires;
setTires((current) => current.filter((t) => t.id !== id));
const { error } = await supabase.from("tires").delete().eq("id", id);
if (error) {
setTires(prev);
showToast("Couldn't remove tire — try again");
}
}
async function handleSaveEdit(id, updates) {
const { data, error } = await supabase
.from("tires")
.update(updates)
.eq("id", id)
.select()
.single();
if (error) {
showToast("Couldn't save changes — try again");
return;
}
setTires((current) => current.map((t) => (t.id === id ? data : t)));
setEditingId(null);
setLastAddedId(id);
setTimeout(() => setLastAddedId(null), 1700);
}
async function handleSold(item) {
const prev = tires;
setTires((current) => current.filter((t) => t.id !== item.id));
const { error: insertError } = await supabase.from("sold_items").insert({
size: item.size,
rim: item.rim,
location: item.location,
flags: item.flags,
price: item.price,
});
if (insertError) {
setTires(prev);
showToast("Couldn't mark as sold — try again");
return;
}
const { error: deleteError } = await supabase.from("tires").delete().eq("id", item.id);
if (deleteError) {
showToast("Logged as sold, but couldn't remove from inventory — remove it manually");
return;
}
showToast(item.size + " marked sold");
}
function handlePrint() {
window.print();
}
async function handleCopy() {
try {
await navigator.clipboard.writeText(buildSummaryText(tires));
showToast("Summary copied to clipboard");
} catch {
showToast("Couldn't copy — select and copy manually");
}
}
const rimGroups = useMemo(() => {
const groups = {};
RIM_ORDER.forEach((rim) => {
const all = tires.filter((t) => t.rim === rim).sort(sortCompare);
const filtered = search ? all.filter((t) => matchesQuery(t, search)) : all;
if (filtered.length > 0) groups[rim] = filtered;
});
return groups;
}, [tires, search]);
const totalMatches = useMemo(
() => Object.values(rimGroups).reduce((sum, arr) => sum + arr.length, 0),
[rimGroups]
);
const printableTires = useMemo(() => {
return search ? tires.filter((t) => matchesQuery(t, search)) : tires;
}, [tires, search]);
const locationGroups = useMemo(() => groupByLocation(printableTires), [printableTires]);
const flagGroups = useMemo(() => groupByFlag(printableTires), [printableTires]);
const fullListSorted = useMemo(() => [...printableTires].sort(sortCompare), [printableTires]);
if (session === undefined || !loaded) {
return <div className="loading-screen">Loading inventory&hellip;</div>;
}
return (
<div className="page">
<div className="header">
<div>
<div className="brand"><span className="dot" />Faith Tire Center Inventory</div>
<div className="sub">Grouped by rim size &middot; sorted by size &middot; Location = physical slot number</div>
</div>
<div className="header-right">
<div className="count"><b>{tires.length}</b> tires on file</div>
</div>
</div>
<div className="toolbar">
<button className="tool-btn" onClick={handlePrint}>🖨 Print</button>
<select
className="print-scope-select"
value={printMode}
onChange={(e) => setPrintMode(e.target.value)}
title="What to include when printing"
>
<option value="size">By Rim Size</option>
<option value="location">By Location</option>
<option value="flag">By Flag (New/Pair/Set)</option>
<option value="full">Full List</option>
</select>
<button className="tool-btn" onClick={handleCopy}>📋 Copy Summary</button>
</div>
<div className="search-wrap">
<input
type="text"
placeholder="Search by size, location, flag, or price…"
value={search}
onChange={(e) => setSearch(e.target.value)}
/>
{search ? (
<span className="search-icon" />
) : (
<span className="search-icon">🔍</span>
)}
{search && (
<button className="search-clear" onClick={() => setSearch("")}>×</button>
)}
</div>
{search && (
<div className="search-count">
{totalMatches === 0
? `No tires match "${search}"`
: `${totalMatches} match${totalMatches === 1 ? "" : "es"} for "${search}"`}
</div>
)}
<AddForm
fSize={fSize} setFSize={setFSize}
fRim={fRim} setFRim={setFRim}
fLoc={fLoc} setFLoc={setFLoc}
fFlags={fFlags} setFFlags={setFFlags}
fPrice={fPrice} setFPrice={setFPrice}
formError={formError}
onAdd={handleAdd}
/>
<div className="grid">
{Object.keys(rimGroups).map((rim) => (
<RimPanel
key={rim}
rim={rim}
items={rimGroups[rim]}
search={search}
editingId={editingId}
setEditingId={setEditingId}
lastAddedId={lastAddedId}
onDelete={handleDelete}
onSaveEdit={handleSaveEdit}
onSold={handleSold}
/>
))}
</div>
{/* Print-only view. Hidden on screen; shown via @media print in globals.css */}
<div className="print-view">
<div className="print-title">Faith Tire Center Inventory</div>
<div className="print-sub">
{printMode === "size" && "Grouped by rim size"}
{printMode === "location" && "Grouped by location"}
{printMode === "flag" && "Grouped by flag"}
{printMode === "full" && "Full list, sorted by size"}
{" — "}
{printableTires.length} tires{search ? ` (filtered by "${search}")` : ""}
</div>
{printMode === "size" &&
RIM_ORDER.filter((rim) => rimGroups[rim] && rimGroups[rim].length > 0).map((rim) => (
<PrintGroup key={rim} title={`Rim ${rim}"`} items={rimGroups[rim]} />
))}
{printMode === "location" &&
locationGroups.map((g) => (
<PrintGroup
key={g.location ?? "unassigned"}
title={g.location ? `Location ${g.location}` : "No location set"}
items={g.items}
showRim
/>
))}
{printMode === "flag" &&
flagGroups.map((g) => (
<PrintGroup key={g.flag} title={g.flag} items={g.items} showRim />
))}
{printMode === "full" && <PrintGroup title="All Tires" items={fullListSorted} showRim />}
</div>
<div className="footer">Shared cloud data &middot; synced live via Supabase for everyone signed in</div>
<div className={"toast" + (toast ? " show" : "")}>{toast}</div>
</div>
);
}
function PrintGroup({ title, items, showRim }) {
return (
<div className="print-group">
<div className="print-group-title">{title} <span>({items.length})</span></div>
<table className="print-table">
<thead>
<tr>
<th>Tire Size</th>
{showRim && <th>Rim</th>}
<th>Location</th>
<th>Flags</th>
<th>Price</th>
</tr>
</thead>
<tbody>
{items.map((item) => (
<tr key={item.id}>
<td>{item.size}</td>
{showRim && <td>{item.rim}&Prime;</td>}
<td>{item.location ?? "—"}</td>
<td>{item.flags || ""}</td>
<td>{item.price || ""}</td>
</tr>
))}
</tbody>
</table>
</div>
);
}
function AddForm({ fSize, setFSize, fRim, setFRim, fLoc, setFLoc, fFlags, setFFlags, fPrice, setFPrice, formError, onAdd }) {
function onKeyDown(e) {
if (e.key === "Enter") onAdd();
}
return (
<div className="add-form">
<div className="field-sm">
<label>Tire size *</label>
<input type="text" placeholder="e.g. 225/60/17" value={fSize} onChange={(e) => setFSize(e.target.value)} onKeyDown={onKeyDown} />
</div>
<div className="field-sm">
<label>Rim size</label>
<select value={fRim} onChange={(e) => setFRim(e.target.value)}>
<option value="auto">Auto-detect</option>
{RIM_ORDER.map((r) => (
<option key={r} value={r}>{r}&quot;</option>
))}
</select>
</div>
<div className="field-sm">
<label>Location (slot number) *</label>
<input type="number" min="1" placeholder="e.g. 4 or 12" value={fLoc} onChange={(e) => setFLoc(e.target.value)} onKeyDown={onKeyDown} />
</div>
<div className="field-sm">
<label>Flags &amp; price</label>
<div className="flags-row">
{["New", "Pair", "Set"].map((f) => (
<button
type="button"
key={f}
className={"flag-toggle " + f + (fFlags[f] ? " active" : "")}
onClick={() => setFFlags({ ...fFlags, [f]: !fFlags[f] })}
>
{f}
</button>
))}
<input
className="price-input"
type="text"
placeholder="$ price (optional)"
value={fPrice}
onChange={(e) => setFPrice(e.target.value)}
/>
</div>
</div>
<button className="add-btn" onClick={onAdd}>+ Add Tire</button>
{formError && <div className="inline-error">{formError}</div>}
</div>
);
}
function RimPanel({ rim, items, search, editingId, setEditingId, lastAddedId, onDelete, onSaveEdit, onSold }) {
return (
<div className="panel">
<div className="panel-head">
<h3>Rim {rim}&Prime;</h3>
<span>{items.length} in stock</span>
</div>
<div className="col-labels">
<span>Tire Size</span><span>Location</span><span>Actions</span>
</div>
<div className="rows">
{items.length === 0 ? (
<div className="empty">No tires on this rim yet</div>
) : (
items.map((item) => (
item.id === editingId ? (
<EditRow key={item.id} item={item} onCancel={() => setEditingId(null)} onSave={onSaveEdit} />
) : (
<Row
key={item.id}
item={item}
search={search}
flash={item.id === lastAddedId}
onEdit={() => setEditingId(item.id)}
onDelete={() => onDelete(item.id)}
onSold={() => onSold(item)}
/>
)
)))}
</div>
</div>
);
}
function Row({ item, search, flash, onEdit, onDelete, onSold }) {
const flagList = (item.flags || "").split(",").map((f) => f.trim()).filter(Boolean);
const flagClasses = flagList.map((f) => "has-" + f).join(" ");
const loc = item.location === null || item.location === undefined || item.location === "" ? "—" : item.location;
return (
<div className={"row " + flagClasses + (flash ? " flash" : "")}>
<div className="size-wrap">
<span className="size-text" dangerouslySetInnerHTML={{ __html: highlightHtml(item.size, search) }} />
<div className="badges">
{flagList.map((f) => (
<span key={f} className={"badge " + f}>{f}</span>
))}
{item.price && <span className="badge price">{item.price}</span>}
</div>
</div>
<div className="loc">{loc}</div>
<div className="row-actions">
<button className="edit-btn" onClick={onEdit}>Edit</button>
<button className="sold-btn" onClick={onSold}>Sold</button>
<button className="del-btn" onClick={onDelete}>Remove</button>
</div>
</div>
);
}
function EditRow({ item, onCancel, onSave }) {
const flagList = (item.flags || "").split(",").map((f) => f.trim()).filter(Boolean);
const [size, setSize] = useState(item.size);
const [rim, setRim] = useState(item.rim);
const [loc, setLoc] = useState(item.location ?? "");
const [flags, setFlags] = useState({
New: flagList.includes("New"),
Pair: flagList.includes("Pair"),
Set: flagList.includes("Set"),
});
const [price, setPrice] = useState(item.price || "");
const [err, setErr] = useState("");
function save() {
const rawSize = size.trim();
if (!rawSize) {
setErr("Tire size is required.");
return;
}
const locRaw = String(loc).trim();
if (locRaw === "") {
setErr("Location is required.");
return;
}
const n = parseInt(locRaw, 10);
if (isNaN(n) || n < 1) {
setErr("Location must be a positive number.");
return;
}
const flagStr = Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join(", ");
onSave(item.id, {
size: normalizeSize(rawSize),
rim,
location: String(n),
flags: flagStr,
price: price.trim(),
});
}
return (
<div className="row editing">
<div className="edit-form">
<div className="field-sm">
<label>Tire size *</label>
<input type="text" value={size} onChange={(e) => setSize(e.target.value)} />
</div>
<div className="field-sm">
<label>Rim size</label>
<select value={rim} onChange={(e) => setRim(e.target.value)}>
{RIM_ORDER.map((r) => (
<option key={r} value={r}>{r}&quot;</option>
))}
</select>
</div>
<div className="field-sm">
<label>Location (slot number) *</label>
<input type="number" min="1" value={loc} onChange={(e) => setLoc(e.target.value)} />
</div>
<div className="field-sm" style={{ gridColumn: "1 / -1" }}>
<label>Flags &amp; price</label>
<div className="flags-row">
{["New", "Pair", "Set"].map((f) => (
<button
type="button"
key={f}
className={"flag-toggle " + f + (flags[f] ? " active" : "")}
onClick={() => setFlags({ ...flags, [f]: !flags[f] })}
>
{f}
</button>
))}
<input className="price-input" type="text" placeholder="$ price" value={price} onChange={(e) => setPrice(e.target.value)} />
</div>
</div>
{err && <div className="inline-error">{err}</div>}
<div className="edit-actions">
<button className="cancel-btn" onClick={onCancel}>Cancel</button>
<button className="save-btn" onClick={save}>Save Changes</button>
</div>
</div>
</div>
);
}
