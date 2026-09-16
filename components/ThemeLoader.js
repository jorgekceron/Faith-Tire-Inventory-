"use client";
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
const VAR_MAP = {
badge_new_color: "--new",
badge_pair_color: "--pair",
badge_set_color: "--set",
action_sold_color: "--sold-color",
action_edit_color: "--edit-color",
action_delete_color: "--delete-color",
};
function applySettings(rows) {
if (typeof document === "undefined") return;
rows.forEach((row) => {
const cssVar = VAR_MAP[row.key];
if (cssVar && row.value) {
document.documentElement.style.setProperty(cssVar, row.value);
}
});
}
export default function ThemeLoader() {
useEffect(() => {
let active = true;
async function load() {
const { data, error } = await supabase.from("app_settings").select("key, value");
if (!active) return;
if (!error && data) applySettings(data);
}
load();
const channel = supabase
.channel("app-settings-changes")
.on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, (payload) => {
if (payload.new && payload.new.key) {
applySettings([payload.new]);
}
})
.subscribe();
return () => {
active = false;
supabase.removeChannel(channel);
};
}, []);
return null;
}
