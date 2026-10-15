import {
  Activity,
  Bell,
  CalendarDays,
  ClipboardList,
  Image,
  IndianRupee,
  LayoutDashboard,
  NotebookPen,
  Settings,
  TrendingUp,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AdminSectionId =
  | "overview"
  | "patients"
  | "appointments"
  | "timeline"
  | "plans"
  | "payments"
  | "notes"
  | "care"
  | "media"
  | "staff"
  | "analytics"
  | "settings";

export interface AdminNavItem {
  id: AdminSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      { id: "overview", label: "Overview", description: "Today at a glance", icon: LayoutDashboard },
    ],
  },
  {
    label: "Patient Care",
    items: [
      { id: "patients", label: "Patients", description: "Records & prescriptions", icon: Users },
      { id: "appointments", label: "Appointments", description: "Calendar & scheduling", icon: CalendarDays },
      { id: "timeline", label: "Timeline", description: "Full patient history", icon: Activity },
      { id: "plans", label: "Treatment Plans", description: "Sessions & progress", icon: ClipboardList },
      { id: "notes", label: "Clinical Notes", description: "Symptoms & diagnosis", icon: NotebookPen },
      { id: "care", label: "Care & Reminders", description: "Follow-ups, consent, billing", icon: Bell },
    ],
  },
  {
    label: "Business",
    items: [
      { id: "payments", label: "Payments", description: "Dues & collections", icon: IndianRupee },
      { id: "analytics", label: "Analytics", description: "Reports & trends", icon: TrendingUp },
    ],
  },
  {
    label: "Clinic",
    items: [
      { id: "media", label: "Reviews & Media", description: "Testimonial gallery", icon: Image },
      { id: "staff", label: "Staff", description: "Team & permissions", icon: UserCog },
      { id: "settings", label: "Settings", description: "Clinic profile & login", icon: Settings },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

export const getAdminNavItem = (id: AdminSectionId) => ADMIN_NAV_ITEMS.find((item) => item.id === id);
