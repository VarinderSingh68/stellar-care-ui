import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getClinicSettings, isAdminLoggedIn, loginAdmin } from "@/lib/admin";

const AdminLoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { data: clinicName = "Dr. Rana Dental Clinic" } = useQuery({
    queryKey: ["clinicSettings", "name"],
    queryFn: async () => (await getClinicSettings()).clinicName,
  });

  useEffect(() => {
    if (isAdminLoggedIn()) {
      navigate("/admin/dashboard");
    }
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const success = await loginAdmin(username.trim(), password.trim());
      if (success) {
        navigate("/admin/dashboard");
        return;
      }
      setError("Invalid username or password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 shadow-elevated">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Stethoscope className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-medium uppercase tracking-[0.3em] text-primary">Admin Portal</p>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">{clinicName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to manage patients, appointments, and clinic operations.</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="admin"
                disabled={isSubmitting}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                disabled={isSubmitting}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 text-sm text-muted-foreground">
            First time signing in? The default account is{" "}
            <span className="text-foreground">admin / password123</span> -- change it right away from Settings once
            you're in.
          </div>

          <div className="mt-6 text-center text-sm">
            <Link to="/" className="text-primary hover:underline">Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
