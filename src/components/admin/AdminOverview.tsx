import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  CalendarCheck,
  ClipboardList,
  IndianRupee,
  MessageCircle,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPatient, getBookings, getPatients } from "@/lib/admin";
import { getFollowUps } from "@/lib/patient-portal";
import {
  formatCurrencyValue,
  formatDateValue,
  getBalanceDueAmount,
  getTodayInputValue,
  isSameMonth,
  mutedTextClass,
  openWhatsApp,
  sortAppointments,
} from "./adminFormatters";
import { AdminSectionId } from "./adminNav";

interface AdminOverviewProps {
  clinicName: string;
  onNavigate: (section: AdminSectionId) => void;
}

const StatCard = ({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
  tone: string;
}) => (
  <Card>
    <CardContent className="p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
      <p className={mutedTextClass}>{hint}</p>
    </CardContent>
  </Card>
);

const AdminOverview = ({ clinicName, onNavigate }: AdminOverviewProps) => {
  const patients = useMemo<AdminPatient[]>(() => getPatients(), []);
  const followUps = useMemo(() => getFollowUps(), []);
  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments"],
    queryFn: getBookings,
  });

  const today = getTodayInputValue();

  const todayAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.appointmentDate === today).sort(sortAppointments),
    [appointments, today],
  );

  const pendingPaymentPatients = useMemo(
    () =>
      patients.filter(
        (patient) =>
          getBalanceDueAmount(patient) > 0 || patient.paymentStatus === "partial" || patient.paymentStatus === "unpaid",
      ),
    [patients],
  );

  const activeReminders = useMemo(
    () => followUps.filter((followUp) => followUp.status !== "completed").sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [followUps],
  );

  const analytics = useMemo(() => {
    const paidThisMonth = patients.reduce((sum, patient) => {
      if (!isSameMonth(patient.visitDate || patient.prescriptionDate)) return sum;
      return sum + Number(patient.amountPaid || 0);
    }, 0);
    const pendingDues = patients.reduce((sum, patient) => sum + getBalanceDueAmount(patient), 0);
    const monthPatients = patients.filter((patient) => isSameMonth(patient.visitDate || patient.prescriptionDate)).length;
    return { paidThisMonth, pendingDues, monthPatients };
  }, [patients]);

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Welcome back. Here is what needs attention at {clinicName} today, {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CalendarCheck}
          label="Today"
          value={String(todayAppointments.length)}
          hint="appointments scheduled"
          tone="bg-sky-500/15 text-sky-300"
        />
        <StatCard
          icon={IndianRupee}
          label="Pending Dues"
          value={formatCurrencyValue(analytics.pendingDues)}
          hint={`${pendingPaymentPatients.length} patients need follow-up`}
          tone="bg-amber-500/15 text-amber-300"
        />
        <StatCard
          icon={Bell}
          label="Open Reminders"
          value={String(activeReminders.length)}
          hint="follow-ups pending"
          tone="bg-rose-500/15 text-rose-300"
        />
        <StatCard
          icon={TrendingUp}
          label="This Month"
          value={String(analytics.monthPatients)}
          hint={`${formatCurrencyValue(analytics.paidThisMonth)} collected`}
          tone="bg-emerald-500/15 text-emerald-300"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Today's Schedule</CardTitle>
            <Button size="sm" variant="ghost" className="gap-1 text-primary" onClick={() => onNavigate("appointments")}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayAppointments.length === 0 ? (
              <p className={mutedTextClass}>No appointments scheduled for today.</p>
            ) : (
              todayAppointments.slice(0, 6).map((appointment) => (
                <div key={appointment.id} className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{appointment.patientName}</p>
                    <p className={mutedTextClass}>{appointment.reason}</p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span className="text-sm text-muted-foreground">{appointment.appointmentTime}</span>
                    <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs capitalize text-secondary-foreground">
                      {appointment.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Pending Payments</CardTitle>
            <Button size="sm" variant="ghost" className="gap-1 text-primary" onClick={() => onNavigate("payments")}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingPaymentPatients.length === 0 ? (
              <p className={mutedTextClass}>No pending payments. All clear.</p>
            ) : (
              pendingPaymentPatients.slice(0, 6).map((patient) => (
                <div key={patient.id} className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{patient.name}</p>
                    <p className={mutedTextClass}>Balance: {formatCurrencyValue(getBalanceDueAmount(patient))}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0 gap-2"
                    onClick={() =>
                      openWhatsApp(
                        patient.phone,
                        `Dear ${patient.name}, your pending balance is ${formatCurrencyValue(getBalanceDueAmount(patient))}. Please contact the clinic for payment support.`,
                      )
                    }
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Remind
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Open Reminders</CardTitle>
            <Button size="sm" variant="ghost" className="gap-1 text-primary" onClick={() => onNavigate("care")}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeReminders.length === 0 ? (
              <p className={mutedTextClass}>No pending reminders.</p>
            ) : (
              activeReminders.slice(0, 6).map((followUp) => {
                const patient = patients.find((item) => item.id === followUp.patientId);
                return (
                  <div key={followUp.id} className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{followUp.title}</p>
                      <p className={mutedTextClass}>{patient?.name || "Patient"} | due {formatDateValue(followUp.dueDate)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="justify-start gap-2" onClick={() => onNavigate("patients")}>
              <Users className="h-4 w-4" /> Add Patient
            </Button>
            <Button variant="outline" className="justify-start gap-2" onClick={() => onNavigate("appointments")}>
              <CalendarCheck className="h-4 w-4" /> New Appointment
            </Button>
            <Button variant="outline" className="justify-start gap-2" onClick={() => onNavigate("plans")}>
              <ClipboardList className="h-4 w-4" /> Treatment Plan
            </Button>
            <Button variant="outline" className="justify-start gap-2" onClick={() => onNavigate("care")}>
              <Bell className="h-4 w-4" /> Add Reminder
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminOverview;
