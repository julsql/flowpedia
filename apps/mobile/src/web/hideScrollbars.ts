import { Platform } from "react-native";

// Hide scrollbars on web while keeping scroll behaviour. No-op on native.
// (React Native Web's showsVerticalScrollIndicator doesn't hide the browser
// scrollbar, so we inject global CSS once.)
if (Platform.OS === "web" && typeof document !== "undefined") {
  const id = "flowpedia-hide-scrollbars";
  if (!document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
    `;
    document.head.appendChild(style);
  }
}
