import React from "react";
import ReactDOM from "react-dom/client";
import { HeroUIProvider } from "@heroui/react";
import App from "./App.tsx";
import "./index.css";
import { ToastProvider } from "@heroui/react";
import { MidiProvider } from "./contexts/midi-context";

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<HeroUIProvider>
		<ToastProvider 
  toastProps={{
    variant: "flat",
    timeout: 2000,
    hideIcon: true,
    classNames: {
		
      closeButton: "opacity-100 absolute right-4 top-1/2 -translate-y-1/2",
    },
  }} 
/>
				<MidiProvider>
			<main className="text-foreground bg-background">
				<App />
			</main>
				</MidiProvider>
		</HeroUIProvider>
	</React.StrictMode>
);
