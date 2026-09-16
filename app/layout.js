import { Oswald, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ThemeLoader from "@/components/ThemeLoader";
import PresenceIndicator from "@/components/PresenceIndicator";
import NavTabs from "@/components/NavTabs";
const oswald = Oswald({
subsets: ["latin"],
variable: "--font-oswald",
weight: ["400", "500", "600", "700"],
});
const jbmono = JetBrains_Mono({
subsets: ["latin"],
variable: "--font-jbmono",
weight: ["400", "500", "700"],
});
export const metadata = {
title: "Faith Tire Center Inventory",
description: "Shared tire inventory manager for Faith Tire Center",
};
export default function RootLayout({ children }) {
return (
<html lang="en" className={`${oswald.variable} ${jbmono.variable}`}>
<body>
<ThemeLoader />
<PresenceIndicator />
<NavTabs />
{children}
</body>
</html>
);
}
