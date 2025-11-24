import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("注册成功，已自动登录");
      navigate("/");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success("登录成功");
      navigate("/");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("请输入邮箱和密码");
    if (mode === "register") {
      await registerMutation.mutateAsync({ email, password, name: name || undefined });
    } else {
      await loginMutation.mutateAsync({ email, password });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === "login" ? "登录" : "注册"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            {mode === "register" && (
              <Input placeholder="昵称（可选）" value={name} onChange={(e)=>setName(e.target.value)} />
            )}
            <Input type="email" placeholder="邮箱" value={email} onChange={(e)=>setEmail(e.target.value)} />
            <Input type="password" placeholder="密码（至少6位）" value={password} onChange={(e)=>setPassword(e.target.value)} />
            <Button type="submit" className="w-full" disabled={registerMutation.isPending || loginMutation.isPending}>
              {mode === "login" ? "登录" : "注册"}
            </Button>
          </form>
          <div className="text-sm text-muted-foreground mt-4 text-center">
            {mode === "login" ? (
              <button className="underline" onClick={()=>setMode("register")}>没有账号？去注册</button>
            ) : (
              <button className="underline" onClick={()=>setMode("login")}>已有账号？去登录</button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
