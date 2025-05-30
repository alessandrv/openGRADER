import { useContext } from "react";
import { ToastContext } from ".";

export type ToastProps = {
  title: string;
  description: string;
  color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
};

// Simple toast hook for notifications
export const useToast = () => {
  const context = useContext(ToastContext);
  
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
};