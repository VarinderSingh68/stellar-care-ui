import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Stethoscope, ShieldCheck, ArrowLeft, RotateCw, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import {
  getClinicSettings,
  isAdminLoggedIn,
  initiateAdminLogin,
  verifyAdmin2FA,
  resendAdmin2FA,
} from "@/lib/admin";

const AdminLoginPage = () => {
  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

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

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");
    setIsSubmitting(true);
    try {
      const result = await initiateAdminLogin(username.trim(), password.trim());
      if (result.require2FA && result.tempToken) {
        setTempToken(result.tempToken);
        setTargetEmail(result.email || "ngw.designer@gmail.com");
        setStep("2fa");
        setOtpCode("");
        setResendCooldown(30);
        setInfoMessage(result.message || `A 6-digit verification code was sent to ${result.email || "the owner email"}.`);
        return;
      }
      if (result.success && result.token) {
        navigate("/admin/dashboard");
        return;
      }
      setError(result.message || "Invalid username or password.");
    } catch (err: any) {
      setError(err?.message || "Invalid username or password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handle2FASubmit = async (event?: FormEvent<HTMLFormElement>) => {
    if (event) event.preventDefault();
    const cleanCode = otpCode.trim().replace(/\D/g, "");
    if (cleanCode.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setError("");
    setInfoMessage("");
    setIsSubmitting(true);
    try {
      const result = await verifyAdmin2FA(tempToken, cleanCode);
      if (result.success) {
        navigate("/admin/dashboard");
        return;
      }
      setError(result.message || "Invalid verification code.");
    } catch (err: any) {
      setError(err?.message || "Verification failed. Please check the code and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending || !tempToken) return;
    setError("");
    setInfoMessage("");
    setIsResending(true);
    try {
      const result = await resendAdmin2FA(tempToken);
      if (result.success) {
        setInfoMessage(result.message || "A new 6-digit code has been sent.");
        setResendCooldown(30);
      } else {
        setError(result.message || "Could not resend verification code.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to resend verification code.");
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToCredentials = () => {
    setStep("credentials");
    setOtpCode("");
    setError("");
    setInfoMessage("");
    setTempToken("");
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 shadow-elevated">
          {step === "credentials" ? (
            <>
              <div className="mb-8 flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Stethoscope className="h-6 w-6" />
                </div>
                <p className="mt-4 text-sm font-medium uppercase tracking-[0.3em] text-primary">Admin Portal</p>
                <h1 className="mt-2 text-2xl font-semibold text-foreground">{clinicName}</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sign in to manage patients, appointments, and clinic operations.
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleCredentialsSubmit}>
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
                  {isSubmitting ? "Verifying..." : "Continue"}
                </Button>
              </form>

              <div className="mt-6 text-sm text-muted-foreground">
                First time signing in? The default account is{" "}
                <span className="text-foreground">admin / password123</span> -- change it right away from Settings once
                you're in.
              </div>

              <div className="mt-6 text-center text-sm">
                <Link to="/" className="text-primary hover:underline">
                  Back to home
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="mb-8 flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
                  <span>Two-Factor Authentication</span>
                </div>
                <h1 className="mt-3 text-2xl font-semibold text-foreground">Enter Verification Code</h1>
                <div className="mt-2 text-sm text-muted-foreground">
                  <p>A random 6-digit code has been sent to:</p>
                  <div className="mt-1 flex items-center justify-center gap-1.5 font-medium text-foreground">
                    <Mail className="h-3.5 w-3.5 text-primary" />
                    <span>{targetEmail || "ngw.designer@gmail.com"}</span>
                  </div>
                </div>
              </div>

              <form className="space-y-6" onSubmit={handle2FASubmit}>
                <div className="flex flex-col items-center space-y-2">
                  <Label htmlFor="otp" className="sr-only">
                    6-digit verification code
                  </Label>
                  <InputOTP
                    id="otp"
                    maxLength={6}
                    value={otpCode}
                    onChange={(val) => {
                      setOtpCode(val);
                      if (val.length === 6) {
                        setError("");
                      }
                    }}
                    disabled={isSubmitting}
                    autoFocus
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                {infoMessage && (
                  <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-center text-xs text-primary">
                    {infoMessage}
                  </div>
                )}

                {error && <p className="text-center text-sm text-destructive">{error}</p>}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting || otpCode.trim().length !== 6}
                >
                  {isSubmitting ? "Verifying code..." : "Verify & Open Admin Panel"}
                </Button>

                <div className="flex flex-col items-center gap-3 pt-2 text-center text-sm">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || isResending}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCw className={`h-3 w-3 ${isResending ? "animate-spin" : ""}`} />
                    {resendCooldown > 0
                      ? `Resend new code in ${resendCooldown}s`
                      : "Didn't receive code? Resend"}
                  </button>

                  <button
                    type="button"
                    onClick={handleBackToCredentials}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back to username & password
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
