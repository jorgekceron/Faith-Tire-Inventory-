export const RIM_ORDER = [
"13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26",
];
export const ORDER_STATUSES = ["Pending", "Ordered", "Ready for Pickup", "Completed"];
export function parseSize(sizeStr) {
const s = String(sizeStr || "").trim();
const m = s.match(/^(LT)?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i);
if (m) {
return {
lt: m[1] ? 1 : 0,
width: parseFloat(m[2]),
aspect: parseFloat(m[3]),
diameter: parseFloat(m[4]),
ok: true,
};
}
return { lt: 2, width: 0, aspect: 0, diameter: 0, ok: false };
}
export function sortCompare(a, b) {
const pa = parseSize(a.size);
const pb = parseSize(b.size);
if (pa.lt !== pb.lt) return pa.lt - pb.lt;
if (pa.width !== pb.width) return pa.width - pb.width;
if (pa.aspect !== pb.aspect) return pa.aspect - pb.aspect;
if (pa.diameter !== pb.diameter) return pa.diameter - pb.diameter;
return String(a.size).localeCompare(String(b.size));
}
export function detectRim(sizeStr) {
const p = parseSize(sizeStr);
if (p.ok && RIM_ORDER.includes(String(Math.round(p.diameter)))) {
return String(Math.round(p.diameter));
}
return null;
}
export function normalizeSize(sizeStr) {
let s = String(sizeStr || "").trim();
s = s.replace(/^lt\s*\/?\s*/i, "LT");
return s;
}
export function matchesQuery(item, q) {
if (!q) return true;
const hay = [item.size, item.location, item.flags, item.price, "rim " + item.rim]
.filter((v) => v !== null && v !== undefined)
.join(" ")
.toLowerCase();
return hay.includes(q.toLowerCase());
}
export function buildSummaryText(tires) {
const lines = [];
lines.push("FAITH TIRE CENTER INVENTORY");
lines.push("Generated " + new Date().toLocaleDateString());
lines.push("");
RIM_ORDER.forEach((rim) => {
const items = tires.filter((t) => t.rim === rim).sort(sortCompare);
if (items.length === 0) return;
lines.push('RIM ' + rim + '"  (' + items.length + " in stock)");
lines.push("-".repeat(30));
items.forEach((item) => {
const loc =
item.location === null || item.location === undefined || item.location === ""
? "\u2014"
: item.location;
let line = "  " + item.size + "  |  Loc " + loc;
if (item.flags) line += "  |  " + item.flags;
if (item.price) line += "  |  " + item.price;
lines.push(line);
});
lines.push("");
});
lines.push("Total tires: " + tires.length);
return lines.join("\n");
}
// Best-effort parse of a price string like "$105" or "105" into a number.
// Returns null if nothing numeric is found.
export function parsePrice(str) {
if (!str) return null;
const m = String(str).match(/[\d,]+(?:\.\d+)?/);
if (!m) return null;
const n = parseFloat(m[0].replace(/,/g, ""));
return isNaN(n) ? null : n;
}
// Groups tires by location for the "By Location" print/report view.
export function groupByLocation(tires) {
const map = new Map();
tires.forEach((t) => {
const key = t.location === null || t.location === undefined || t.location === "" ? "" : String(t.location);
if (!map.has(key)) map.set(key, []);
map.get(key).push(t);
});
const entries = Array.from(map.entries());
entries.sort((a, b) => {
if (a[0] === "") return 1;
if (b[0] === "") return -1;
return parseInt(a[0], 10) - parseInt(b[0], 10);
});
return entries.map(([location, items]) => ({
location: location === "" ? null : location,
items: items.slice().sort(sortCompare),
}));
}
// Groups tires by flag for the "By Flag" print/report view. A tire with
// multiple flags (e.g. "New, Pair") appears in each relevant group.
export function groupByFlag(tires) {
const groups = { New: [], Pair: [], Set: [], "No Flag": [] };
tires.forEach((t) => {
const flagList = (t.flags || "").split(",").map((f) => f.trim()).filter(Boolean);
if (flagList.length === 0) {
groups["No Flag"].push(t);
} else {
flagList.forEach((f) => {
if (groups[f]) groups[f].push(t);
});
}
});
return ["New", "Pair", "Set", "No Flag"]
.filter((k) => groups[k].length > 0)
.map((k) => ({ flag: k, items: groups[k].slice().sort(sortCompare) }));
}
