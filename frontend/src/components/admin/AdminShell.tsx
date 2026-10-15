import { ReactNode, useState } from "react";
import { LogOut, Menu, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_GROUPS, AdminSectionId, getAdminNavItem } from "./adminNav";

interface AdminShellProps {
  activeSection: AdminSectionId;
  onSectionChange: (section: AdminSectionId) => void;
  clinicName: string;
  onLogout: () => void;
  children: ReactNode;
}

const NavList = ({
  activeSection,
  onSelect,
}: {
  activeSection: AdminSectionId;
  onSelect: (section: AdminSectionId) => void;
}) => (
  <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
    {ADMIN_NAV_GROUPS.map((group) => (
      <div key={group.label}>
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          {group.label}
        </p>
        <div className="mt-2 space-y-1">
          {group.items.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-sidebar-foreground/60")} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </nav>
);

const SidebarBrand = ({ clinicName }: { clinicName: string }) => (
  <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
      <Stethoscope className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-sidebar-foreground">{clinicName}</p>
      <p className="text-xs text-sidebar-foreground/50">Admin Console</p>
    </div>
  </div>
);

const AdminShell = ({ activeSection, onSectionChange, clinicName, onLogout, children }: AdminShellProps) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const activeItem = getAdminNavItem(activeSection);

  const handleSelect = (section: AdminSectionId) => {
    onSectionChange(section);
    setMobileNavOpen(false);
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
          <SidebarBrand clinicName={clinicName} />
          <NavList activeSection={activeSection} onSelect={handleSelect} />
          <div className="border-t border-sidebar-border p-3">
            <Button variant="ghost" onClick={onLogout} className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </aside>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="dark flex w-72 flex-col gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
            <SidebarBrand clinicName={clinicName} />
            <NavList activeSection={activeSection} onSelect={handleSelect} />
            <div className="border-t border-sidebar-border p-3">
              <Button variant="ghost" onClick={onLogout} className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-border bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-8">
            <Button
              variant="outline"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-foreground">{activeItem?.label ?? "Admin"}</h1>
              <p className="truncate text-sm text-muted-foreground">{activeItem?.description}</p>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default AdminShell;
