"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import PageSkeleton from "@/components/PageSkeleton";
const FLAG_DEFAULTS = {
badge_new_color: "#6fae54",
badge_pair_color: "#4f8bd6",
badge_set_color: "#c76b3f",
};
const FLAG_LABELS = {
badge_new_color: "New",
badge_pair_color: "Pair",
badge_set_color: "Set",
};
const ACTION_DEFAULTS = {
action_sold_color: "#6fae54",
action_edit_color: "#5c7a8a",
action_delete_color: "#b3392f",
};
const ACTION_LABELS = {
action_sold_color: "Sold",
action_edit_color: "Edit",
action_delete_color: "Remove",
};
const DEFAULTS = { ...FLAG_DEFAULTS, ...ACTION_DEFAULTS };
const VAR_MAP = {
badge_new_color: "--new",
badge_pair_color: "--pair",
badge_set_color: "--set",
action_sold_color: "--sold-color",
action_edit_color: "--edit-color",
action_delete_color: "--delete-color",
};
export default function SettingsPage() {
const router = useRouter();
const [session, setSession] = useState(undefined);
const [colors, setColors] = useState(DEFAULTS);
const [loaded, setLoaded] = useState(false);
const [saving, setSaving] = useState(false);
const [toast, setToast] = useState("");
const toastTimer = useRef(null);
const [services, setServices] = useState([]);
const [nName, setNName] = useState("");
const [nCategory, setNCategory] = useState("");
const [nPrice, setNPrice] = useState("");
const [serviceError, setServiceError] = useState("");
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
const { data, error } = await supabase.from("app_settings").select("key, value");
if (!active) return;
if (!error && data) {
const next = { ...DEFAULTS };
data.forEach((row) => {
if (row.key in next) next[row.key] = row.value;
});
setColors(next);
}
setLoaded(true);
}
load();
return () => {
active = false;
};
}, [session]);
async function loadServices() {
const { data, error } = await supabase
.from("services")
.select("*, service_addons(*)")
.order("category", { ascending: true })
.order("name", { ascending: true });
if (!error) setServices(data || []);
}
useEffect(() => {
if (!session) return;
let active = true;
loadServices();
const channel = supabase
.channel("settings-services-changes")
.on("postgres_changes", { event: "*", schema: "public", table: "services" }, () => {
if (active) loadServices();
})
.on("postgres_changes", { event: "*", schema: "public", table: "service_addons" }, () => {
if (active) loadServices();
})
.subscribe();
return () => {
active = false;
supabase.removeChannel(channel);
};
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [session]);
async function handleAddService() {
setServiceError("");
const name = nName.trim();
if (!name) {
setServiceError("Service name is required.");
return;
}
let price = parseFloat(nPrice);
if (isNaN(price) || price < 0) price = 0;
const { error } = await supabase.from("services").insert({
name,
category: nCategory.trim(),
default_price: price,
});
if (error) {
setServiceError("Couldn't add service: " + error.message);
return;
}
setNName("");
setNCategory("");
setNPrice("");
showToast("Service added");
loadServices();
}
async function handleUpdateService(id, updates) {
const { error } = await supabase.from("services").update(updates).eq("id", id);
if (error) {
showToast("Couldn't save service — try again");
return;
}
showToast("Service updated");
loadServices();
}
async function handleDeleteService(id) {
const { error } = await supabase.from("services").delete().eq("id", id);
if (error) {
showToast("Couldn't remove service — try again");
return;
}
showToast("Service removed");
loadServices();
}
function showToast(msg) {
setToast(msg);
clearTimeout(toastTimer.current);
toastTimer.current = setTimeout(() => setToast(""), 2200);
}
async function handleLogout() {
await supabase.auth.signOut();
router.replace("/login");
}
function handleColorChange(key, value) {
setColors((current) => ({ ...current, [key]: value }));
if (typeof document !== "undefined") {
document.documentElement.style.setProperty(VAR_MAP[key], value);
}
}
async function handleSave() {
setSaving(true);
try {
const rows = Object.entries(colors).map(([key, value]) => ({ key, value }));
const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
if (error) {
showToast("Couldn't save settings — try again");
} else {
showToast("Settings saved for everyone");
}
} finally {
setSaving(false);
}
}
function handleReset() {
setColors(DEFAULTS);
if (typeof document !== "undefined") {
Object.entries(DEFAULTS).forEach(([key, value]) => {
document.documentElement.style.setProperty(VAR_MAP[key], value);
});
}
}
if (session === undefined || !loaded) {
return <PageSkeleton cards={2} />;
}
return (
<div className="page">
<div className="header">
<div>
<div className="brand"><span className="dot" />Settings</div>
<div className="sub">Colors are shared &mdash; changes apply for everyone signed in</div>
</div>
</div>
<div className="settings-panel">
<h3 className="settings-heading">Flag Label Colors</h3>
<div className="settings-grid">
{Object.keys(FLAG_DEFAULTS).map((key) => (
<div className="settings-row" key={key}>
<div className="settings-row-label">
<span className={"badge preview-badge " + FLAG_LABELS[key]}>{FLAG_LABELS[key]}</span>
</div>
<input
type="color"
value={colors[key]}
onChange={(e) => handleColorChange(key, e.target.value)}
className="color-input"
/>
<span className="color-hex">{colors[key]}</span>
</div>
))}
</div>
</div>
<div className="settings-panel" style={{ marginTop: 16 }}>
<h3 className="settings-heading">Action Button Colors</h3>
<div className="settings-grid">
{Object.keys(ACTION_DEFAULTS).map((key) => (
<div className="settings-row" key={key}>
<div className="settings-row-label">
<span className="preview-action-btn" style={{ background: colors[key] }}>
{ACTION_LABELS[key]}
</span>
</div>
<input
type="color"
value={colors[key]}
onChange={(e) => handleColorChange(key, e.target.value)}
className="color-input"
/>
<span className="color-hex">{colors[key]}</span>
</div>
))}
</div>
<div className="settings-actions">
<button className="cancel-btn" onClick={handleReset}>Reset to Defaults</button>
<button className="save-btn" onClick={handleSave} disabled={saving}>
{saving ? "Saving…" : "Save for Everyone"}
</button>
</div>
</div>
<div className="settings-panel" style={{ marginTop: 16, maxWidth: 720 }}>
<h3 className="settings-heading">Services</h3>
<div className="orders-list">
{services.length === 0 ? (
<div className="empty">No services yet</div>
) : (
services.map((s) => (
<ServiceRow key={s.id} service={s} onSave={handleUpdateService} onDelete={handleDeleteService} onAddonsChanged={loadServices} />
))
)}
</div>
<div className="add-form" style={{ gridTemplateColumns: "1.4fr 1fr 0.8fr auto", marginTop: 14 }}>
<div className="field-sm">
<label>Service name *</label>
<input type="text" placeholder="e.g. Alignment" value={nName} onChange={(e) => setNName(e.target.value)} />
</div>
<div className="field-sm">
<label>Category</label>
<input type="text" placeholder="(optional)" value={nCategory} onChange={(e) => setNCategory(e.target.value)} />
</div>
<div className="field-sm">
<label>Default Price ($)</label>
<input type="number" min="0" step="0.01" placeholder="0.00" value={nPrice} onChange={(e) => setNPrice(e.target.value)} />
</div>
<button className="add-btn" onClick={handleAddService}>+ Add Service</button>
{serviceError && <div className="inline-error">{serviceError}</div>}
</div>
</div>
<div className={"toast" + (toast ? " show" : "")}>{toast}</div>
</div>
);
}
function ServiceRow({ service, onSave, onDelete, onAddonsChanged }) {
const [name, setName] = useState(service.name);
const [category, setCategory] = useState(service.category || "");
const [price, setPrice] = useState(String(service.default_price));
const [notes, setNotes] = useState(service.notes || "");
const [err, setErr] = useState("");
const [expanded, setExpanded] = useState(false);
const [addonName, setAddonName] = useState("");
const [addonPrice, setAddonPrice] = useState("");
const [addonError, setAddonError] = useState("");
const addons = service.service_addons || [];
function save() {
setErr("");
const trimmedName = name.trim();
if (!trimmedName) {
setErr("Service name is required.");
return;
}
let p = parseFloat(price);
if (isNaN(p) || p < 0) p = 0;
onSave(service.id, { name: trimmedName, category: category.trim(), default_price: p, notes: notes.trim() });
}
async function addAddon() {
setAddonError("");
const trimmed = addonName.trim();
if (!trimmed) {
setAddonError("Add-on name is required.");
return;
}
let p = parseFloat(addonPrice);
if (isNaN(p) || p < 0) p = 0;
const { error } = await supabase.from("service_addons").insert({
service_id: service.id,
name: trimmed,
price: p,
});
if (error) {
setAddonError("Couldn't add: " + error.message);
return;
}
setAddonName("");
setAddonPrice("");
onAddonsChanged();
}
async function removeAddon(id) {
await supabase.from("service_addons").delete().eq("id", id);
onAddonsChanged();
}
return (
<div className="order-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
<div className="order-main" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", width: "100%" }}>
<div className="field-sm" style={{ flex: "1.4 1 160px" }}>
<label>Name</label>
<input type="text" value={name} onChange={(e) => setName(e.target.value)} />
</div>
<div className="field-sm" style={{ flex: "1 1 120px" }}>
<label>Category</label>
<input type="text" value={category} onChange={(e) => setCategory(e.target.value)} />
</div>
<div className="field-sm" style={{ flex: "0.7 1 100px" }}>
<label>Price ($)</label>
<input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
</div>
{err && <div className="inline-error" style={{ flexBasis: "100%" }}>{err}</div>}
</div>
<div className="order-actions">
<button className="save-btn" onClick={save}>Save</button>
<button className="tool-btn" onClick={() => setExpanded((x) => !x)}>
{expanded ? "Hide Extras" : "Extras" + (addons.length ? " (" + addons.length + ")" : "")}
</button>
<button className="del-btn" onClick={() => onDelete(service.id)}>Remove</button>
</div>
</div>
{expanded && (
<div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
<div className="field-sm" style={{ marginBottom: 12 }}>
<label>Notes / Details</label>
<input type="text" placeholder="e.g. Includes up to 5 qts synthetic oil" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={save} />
</div>
{addons.length > 0 && (
<div style={{ marginBottom: 10 }}>
{addons.map((a) => (
<div className="row" key={a.id} style={{ gridTemplateColumns: "1fr auto auto" }}>
<div className="size-wrap"><span className="size-text">{a.name}</span></div>
<div className="loc">${Number(a.price).toFixed(2)}</div>
<div className="row-actions">
<button className="del-btn" onClick={() => removeAddon(a.id)}>Remove</button>
</div>
</div>
))}
</div>
)}
<div className="field-sm" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
<div style={{ flex: "1.4 1 160px" }}>
<label>Add-on name</label>
<input type="text" placeholder="e.g. Synthetic Upgrade" value={addonName} onChange={(e) => setAddonName(e.target.value)} />
</div>
<div style={{ flex: "0.6 1 100px" }}>
<label>Price ($)</label>
<input type="number" min="0" step="0.01" placeholder="0.00" value={addonPrice} onChange={(e) => setAddonPrice(e.target.value)} />
</div>
<button className="add-btn" onClick={addAddon}>+ Add-on</button>
</div>
{addonError && <div className="inline-error">{addonError}</div>}
</div>
)}
</div>
);
}
