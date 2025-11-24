import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_LOGO, APP_TITLE, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Users, FileText, Download, HardDrive, Settings, FileIcon, ScrollText, Moon, Sun } from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { UserMenu } from "@/components/UserMenu";
import { motion } from "framer-motion";

export default function AdminDashboard() {
  const { user, isAuthenticated, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();

  const { data: stats, isLoading } = trpc.admin.statistics.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const cleanMutation = trpc.admin.cleanExpiredFiles.useMutation({
    onSuccess: (data) => {
      toast.success(`已清理 ${data.cleaned} 个过期文件`);
    },
    onError: (error) => {
      toast.error(`清理失败: ${error.message}`);
    },
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center">
        <p className="text-white">加载中...</p>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center">
        <Card className="w-full max-w-md bg-white/10 backdrop-blur-md border-white/20">
          <CardHeader>
            <CardTitle className="text-center text-white">权限不足</CardTitle>
            <CardDescription className="text-center text-white/70">
              需要管理员权限才能访问此页面
            </CardDescription>
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

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer group">
              <img src={APP_LOGO} alt="Logo" className="h-8 w-8 rounded-lg group-hover:scale-105 transition-transform" />
              <h1 className="text-xl font-bold text-white">{APP_TITLE}</h1>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-white/70 hover:text-white hover:bg-white/10">
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Link href="/">
              <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10">返回首页</Button>
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Content */}
      <motion.div 
        className="container mx-auto px-4 py-8"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item} className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">管理后台</h2>
          <p className="text-white/70">系统概览和管理功能</p>
        </motion.div>

        {/* Statistics Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {[
            { title: "总用户数", icon: Users, value: stats?.totalUsers, color: "text-blue-400" },
            { title: "总文件数", icon: FileText, value: stats?.totalFiles, color: "text-cyan-400" },
            { title: "总下载次数", icon: Download, value: stats?.totalDownloads, color: "text-green-400" },
            { title: "存储空间", icon: HardDrive, value: formatFileSize(stats?.totalStorage || 0), color: "text-yellow-400" },
          ].map((stat, index) => (
            <motion.div key={index} variants={item}>
              <Card className="bg-white/5 backdrop-blur-md border-white/10 hover:bg-white/10 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-white/90">
                    {stat.title}
                  </CardTitle>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {isLoading ? "..." : stat.value || 0}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Management Links */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            { href: "/admin/users", icon: Users, title: "用户管理", desc: "查看和管理用户", color: "text-blue-400" },
            { href: "/admin/files", icon: FileIcon, title: "文件管理", desc: "查看和管理所有文件", color: "text-cyan-400" },
            { href: "/admin/config", icon: Settings, title: "系统配置", desc: "配置系统参数", color: "text-green-400" },
            { href: "/admin/logs", icon: ScrollText, title: "审计日志", desc: "查看系统操作日志", color: "text-yellow-400" },
          ].map((link, index) => (
            <motion.div key={index} variants={item}>
              <Link href={link.href}>
                <Card className="bg-white/5 backdrop-blur-md border-white/10 hover:bg-white/10 transition-all hover:scale-[1.02] cursor-pointer h-full">
                  <CardContent className="pt-6">
                    <div className={`p-3 rounded-xl bg-white/5 w-fit mb-4`}>
                      <link.icon className={`h-8 w-8 ${link.color}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{link.title}</h3>
                    <p className="text-sm text-white/70">{link.desc}</p>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <motion.div variants={item}>
          <Card className="bg-white/5 backdrop-blur-md border-white/10">
            <CardHeader>
              <CardTitle className="text-white">快速操作</CardTitle>
              <CardDescription className="text-white/70">
                常用的管理操作
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => cleanMutation.mutate()}
                disabled={cleanMutation.isPending}
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10 hover:text-white"
              >
                {cleanMutation.isPending ? "清理中..." : "清理过期文件"}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
