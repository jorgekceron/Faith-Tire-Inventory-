"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
const PAGE_NAMES = {
"/inventory": "Inventory",
"/orders": "Customer Orders",
"/sold": "Sold Report",
"/settings": "Settings",
"/tickets": "Job Tickets",
};
export default function PresenceIndicator() {
const pathname = usePathname();
const channelRef = useRef(null);
const selfIdRef = useRef(null);
const [peers, setPeers] = useState([]);
const [open, setOpen] = useState(false);
const [ready, setReady] = useState(false);
useEffect(() => {
let active = true;
async function init() {
const { data } = await supabase.auth.getUser();
if (!active || !data.user) return;
selfIdRef.current = data.user.id;
const channel = supabase.channel("presence-online", {
config: { presence: { key: data.user.id } },
});
channelRef.current = channel;
channel.on("presence", { event: "sync" }, () => {
const state = channel.presenceState();
const list = Object.entries(state)
.filter(([key]) => key !== selfIdRef.current)
.map(([, entries]) => entries[0])
.filter(Boolean);
setPeers(list);
});
channel.subscribe(async (status) => {
if (status === "SUBSCRIBED" && active) {
await channel.track({ email: data.user.email, page: pathname });
setReady(true);
}
});
}
init();
return () => {
active = false;
if (channelRef.current) {
supabase.removeChannel(channelRef.current);
channelRef.current = null;
}
};
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
useEffect(() => {
if (!ready || !channelRef.current) return;
supabase.auth.getUser().then(({ data }) => {
if (data.user && channelRef.current) {
channelRef.current.track({ email: data.user.email, page: pathname });
}
});
}, [pathname, ready]);
if (peers.length === 0) return null;
return (
<div className="presence-wrap">
<button className="presence-badge" onClick={() => setOpen((o) => !o)}>
<span className="presence-dot" /> {peers.length} other{peers.length === 1 ? "" : "s"} online
</button>
{open && (
<div className="presence-list">
{peers.map((p, i) => (
<div className="presence-row" key={i}>
<span className="presence-dot" />
<span className="presence-email">{p.email}</span>
<span className="presence-page">{PAGE_NAMES[p.page] || p.page || ""}</span>
</div>
))}
</div>
)}
</div>
);
}
