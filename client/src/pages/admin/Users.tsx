import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP_LOGO, APP_TITLE } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function AdminUsers() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const { data: users, isLoading } = trpc.admin.users.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("用户角色已更新");
      utils.admin.users.invalidate();
    },
    onError: (error) => {
      toast.error(`更新失败: ${error.message}`);
    },
  });

  const handleRoleChange = (userId: number, newRole: "user" | "admin") => {
    if (confirm(`确定要将此用户角色更改为 ${newRole === "admin" ? "管理员" : "普通用户"} 吗？`)) {
      updateRoleMutation.mutate({ userId, role: newRole });
    }
  };

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center">
        <Card className="w-full max-w-md bg-white/10 backdrop-blur-md border-white/20">
          <CardHeader>
            <CardTitle className="text-center text-white">权限不足</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button className="w-full">返回首页</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between py-4">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <img src={APP_LOGO} alt="Logo" className="h-8 w-8" />
              <h1 className="text-xl font-bold text-white">{APP_TITLE}</h1>
            </div>
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回管理后台
            </Button>
          </Link>
        </div>

        <Card className="bg-white/10 backdrop-blur-md border-white/20">
          <CardHeader>
            <CardTitle className="text-white">用户管理</CardTitle>
            <CardDescription className="text-white/70">
              查看和管理所有用户
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center text-white/70 py-8">加载中...</p>
            ) : !users || users.length === 0 ? (
              <p className="text-center text-white/70 py-8">暂无用户</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-white/5">
                      <TableHead className="text-white/90">ID</TableHead>
                      <TableHead className="text-white/90">姓名</TableHead>
                      <TableHead className="text-white/90">邮箱</TableHead>
                      <TableHead className="text-white/90">登录方式</TableHead>
                      <TableHead className="text-white/90">角色</TableHead>
                      <TableHead className="text-white/90">注册时间</TableHead>
                      <TableHead className="text-white/90">最后登录</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id} className="border-white/10 hover:bg-white/5">
                        <TableCell className="text-white/70">{u.id}</TableCell>
                        <TableCell className="font-medium text-white">
                          {u.name || "未设置"}
                        </TableCell>
                        <TableCell className="text-white/70">
                          {u.email || "未设置"}
                        </TableCell>
                        <TableCell className="text-white/70">
                          {u.loginMethod || "未知"}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={u.role}
                            onValueChange={(value) => handleRoleChange(u.id, value as "user" | "admin")}
                          >
                            <SelectTrigger className="w-32 bg-white/10 border-white/20 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">普通用户</SelectItem>
                              <SelectItem value="admin">管理员</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-white/70">
                          {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                        </TableCell>
                        <TableCell className="text-white/70">
                          {new Date(u.lastSignedIn).toLocaleDateString("zh-CN")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
