import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_PASSWORD, ADMIN_USERNAME, getAdminCredentials, loginAdmin } from "@/lib/admin";

const AdminLoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const savedCredentials = getAdminCredentials();
  const isUsingDefaultCredentials =
    savedCredentials.username === ADMIN_USERNAME && savedCredentials.password === ADMIN_PASSWORD;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginAdmin(username.trim(), password.trim())) {
      navigate("/admin/dashboard");
      return;
    }
    setError(
      isUsingDefaultCredentials
        ? "Invalid credentials. Use admin / password123."
        : "Invalid credentials. Use the username and password saved in Settings.",
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur-xl">
          <div className="mb-8">
            <p className="text-sm uppercase tracking-[0.3em] text-primary">Admin Portal</p>
            <h1 className="mt-4 text-3xl font-semibold">Sign in to manage the clinic</h1>
            <p className="mt-2 text-sm text-muted-foreground">Enter admin login and password to access the full clinic dashboard.</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="admin"
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
                placeholder="password123"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full">Sign in</Button>
          </form>

          {isUsingDefaultCredentials ? (
            <div className="mt-6 text-sm text-muted-foreground">
              Default credentials: <span className="text-foreground">admin / password123</span>
            </div>
          ) : (
            <div className="mt-6 text-sm text-muted-foreground">
              Credentials were updated in admin settings.
            </div>
          )}

          <div className="mt-6 text-center text-sm">
            <Link to="/" className="text-primary hover:underline">Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
