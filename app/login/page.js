"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
export default function LoginPage() {
const router = useRouter();
const [mode, setMode] = useState("signin"); // "signin" | "signup"
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [error, setError] = useState("");
const [notice, setNotice] = useState("");
const [busy, setBusy] = useState(false);
useEffect(() => {
let active = true;
supabase.auth.getSession().then(({ data }) => {
if (active && data.session) router.replace("/inventory");
});
return () => {
active = false;
};
}, [router]);
async function handleSubmit(e) {
e.preventDefault();
setError("");
setNotice("");
if (!email.trim() || !password) {
setError("Enter both an email and a password.");
return;
}
setBusy(true);
try {
if (mode === "signin") {
const { error: signInError } = await supabase.auth.signInWithPassword({
email: email.trim(),
password,
});
if (signInError) {
setError(signInError.message);
} else {
router.replace("/inventory");
}
} else {
const { data, error: signUpError } = await supabase.auth.signUp({
email: email.trim(),
password,
});
if (signUpError) {
setError(signUpError.message);
} else if (data.session) {
router.replace("/inventory");
} else {
setNotice("Account created. Check your email to confirm, then sign in.");
setMode("signin");
}
}
} finally {
setBusy(false);
}
}
return (
<div className="login-wrap">
<div className="login-card">
<h1>Faith Tire Center</h1>
<span className="sub">
{mode === "signin" ? "Sign in to the shared inventory" : "Create a team account"}
</span>
<form onSubmit={handleSubmit}>
<div className="field">
<label htmlFor="email">Email</label>
<input
id="email"
type="email"
autoComplete="email"
value={email}
onChange={(e) => setEmail(e.target.value)}
/>
</div>
<div className="field">
<label htmlFor="password">Password</label>
<input
id="password"
type="password"
autoComplete={mode === "signin" ? "current-password" : "new-password"}
value={password}
onChange={(e) => setPassword(e.target.value)}
/>
</div>
{error && <div className="form-error">{error}</div>}
{notice && <div className="form-notice">{notice}</div>}
<button className="primary-btn" type="submit" disabled={busy}>
{busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
</button>
</form>
<div className="toggle-mode">
{mode === "signin" ? (
<>
New here?{" "}
<button onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>
Create an account
</button>
</>
) : (
<>
Already have an account?{" "}
<button onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>
Sign in
</button>
</>
)}
</div>
</div>
</div>
);
}
