import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getPatientByEmail, createPatientRecord, type PatientRecord } from "@/lib/patient-portal";

const PatientPortalLoginPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Login form
  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  // Registration form
  const [registerData, setRegisterData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    age: "",
    gender: "",
    address: "",
  });

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLoginData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegisterChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setRegisterData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogin = async () => {
    if (!loginData.email.trim() || !loginData.password.trim()) {
      toast({
        title: "Error",
        description: "Please enter email and password",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const patient = getPatientByEmail(loginData.email);
      if (patient && patient.password === loginData.password) {
        localStorage.setItem("cardiovita.patient-auth", JSON.stringify(patient));
        toast({
          title: "Success",
          description: "Welcome to your patient portal!",
        });
        navigate("/patient-portal/dashboard");
      } else {
        toast({
          title: "Error",
          description: "Invalid email or password",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (
      !registerData.name.trim() ||
      !registerData.email.trim() ||
      !registerData.phone.trim() ||
      !registerData.password.trim()
    ) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (registerData.password !== registerData.confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (registerData.password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    if (getPatientByEmail(registerData.email)) {
      toast({
        title: "Error",
        description: "Email already registered",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const newPatient: PatientRecord = {
        id: "",
        patientName: registerData.name,
        patientEmail: registerData.email.toLowerCase(),
        patientPhone: registerData.phone,
        password: registerData.password,
        age: registerData.age,
        gender: registerData.gender,
        address: registerData.address,
      };

      const created = createPatientRecord(newPatient);
      localStorage.setItem("cardiovita.patient-auth", JSON.stringify(created));

      toast({
        title: "Success",
        description: "Account created successfully!",
      });

      navigate("/patient-portal/dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen page-enter flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-2">Patient Portal</h1>
            <p className="text-muted-foreground">Access your health records and appointments</p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  placeholder="your@email.com"
                  value={loginData.email}
                  onChange={handleLoginChange}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={loginData.password}
                  onChange={handleLoginChange}
                  disabled={isLoading}
                />
              </div>

              <Button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? "Logging in..." : "Login to Portal"}
              </Button>

              <div className="pt-2 text-sm text-muted-foreground">
                <p>Demo credentials:</p>
                <p>Email: patient@demo.com</p>
                <p>Password: demo123</p>
              </div>
            </TabsContent>

            <TabsContent value="register" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="register-name">Full Name</Label>
                <Input
                  id="register-name"
                  name="name"
                  placeholder="John Doe"
                  value={registerData.name}
                  onChange={handleRegisterChange}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-email">Email</Label>
                <Input
                  id="register-email"
                  name="email"
                  type="email"
                  placeholder="your@email.com"
                  value={registerData.email}
                  onChange={handleRegisterChange}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-phone">Phone</Label>
                <Input
                  id="register-phone"
                  name="phone"
                  placeholder="+91 XXXXX XXXXX"
                  value={registerData.phone}
                  onChange={handleRegisterChange}
                  disabled={isLoading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="register-age">Age</Label>
                  <Input
                    id="register-age"
                    name="age"
                    type="number"
                    placeholder="30"
                    value={registerData.age}
                    onChange={handleRegisterChange}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-gender">Gender</Label>
                  <select
                    id="register-gender"
                    name="gender"
                    value={registerData.gender}
                    onChange={handleRegisterChange}
                    disabled={isLoading}
                    className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                  >
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-address">Address</Label>
                <Input
                  id="register-address"
                  name="address"
                  placeholder="Your address"
                  value={registerData.address}
                  onChange={handleRegisterChange}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-password">Password</Label>
                <Input
                  id="register-password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={registerData.password}
                  onChange={handleRegisterChange}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-confirm">Confirm Password</Label>
                <Input
                  id="register-confirm"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={registerData.confirmPassword}
                  onChange={handleRegisterChange}
                  disabled={isLoading}
                />
              </div>

              <Button
                onClick={handleRegister}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? "Creating account..." : "Create Account"}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default PatientPortalLoginPage;
