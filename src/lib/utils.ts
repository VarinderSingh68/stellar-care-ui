import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formats a Date as a local YYYY-MM-DD string (the same shape a native
// <input type="date"> uses, and the shape every appointmentDate/dueDate/
// visitDate value in this app is stored in, both here and on the backend).
// Deliberately NOT `date.toISOString().slice(0, 10)` -- toISOString()
// converts to UTC first, which rolls the date back by one for any timezone
// ahead of UTC (e.g. India, UTC+5:30) during the first few hours after
// local midnight.
export function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
