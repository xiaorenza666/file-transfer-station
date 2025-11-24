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
import { APP_LOGO, APP_TITLE, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Copy, Trash2, FileIcon, Clock, Zap, Shield, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { UserMenu } from "@/components/UserMenu";
import { motion } from "framer-motion";

export default function MyFiles() {
  const { user, isAuthenticated, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: files, isLoading } = trpc.files.myFiles.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const deleteMutation = trpc.files.delete.useMutation({
    onSuccess: () => {
      toast.success("文件已删除");
      utils.files.myFiles.invalidate();
    },
    onError: (error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const copyShareLink = (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("分享链接已复制");
  };

  const handleDelete = (fileId: number, filename: string) => {
    if (confirm(`确定要删除文件 "${filename}" 吗？`)) {
      deleteMutation.mutate({ fileId });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center">
        <p className="text-white">加载中...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center">
        <Card className="w-full max-w-md bg-white/10 backdrop-blur-md border-white/20">
          <CardHeader>
            <CardTitle className="text-center text-white">需要登录</CardTitle>
            <CardDescription className="text-center text-white/70">
              请先登录以查看您的文件
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a href={getLoginUrl()}>
              <Button className="w-full">登录</Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

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
            {user?.role === "admin" && (
              <Link href="/admin">
                <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10">管理后台</Button>
              </Link>
            )}
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Content */}
      <motion.div 
        className="container mx-auto px-4 py-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="bg-white/5 backdrop-blur-md border-white/10">
          <CardHeader>
            <CardTitle className="text-white">我的文件</CardTitle>
            <CardDescription className="text-white/70">
              管理您上传的所有文件
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center text-white/70 py-8">加载中...</p>
            ) : !files || files.length === 0 ? (
              <div className="text-center py-12">
                <FileIcon className="h-16 w-16 mx-auto mb-4 text-white/30" />
                <p className="text-white/70 mb-4">还没有上传任何文件</p>
                <Link href="/">
                  <Button className="bg-white/10 hover:bg-white/20 text-white border-white/20">上传文件</Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-white/5">
                      <TableHead className="text-white/90">文件名</TableHead>
                      <TableHead className="text-white/90">大小</TableHead>
                      <TableHead className="text-white/90">下载次数</TableHead>
                      <TableHead className="text-white/90">特性</TableHead>
                      <TableHead className="text-white/90">上传时间</TableHead>
                      <TableHead className="text-white/90 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((file) => (
                      <TableRow key={file.id} className="border-white/10 hover:bg-white/5 group">
                        <TableCell className="font-medium text-white">
                          {file.filename}
                        </TableCell>
                        <TableCell className="text-white/70">
                          {formatFileSize(file.fileSize)}
                        </TableCell>
                        <TableCell className="text-white/70">
                          {file.downloadCount}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {file.burnAfterRead && (
                              <span title="阅后即焚" className="bg-yellow-500/20 p-1 rounded">
                                <Zap className="h-4 w-4 text-yellow-400" />
                              </span>
                            )}
                            {file.expiresAt && (
                              <span title="有过期时间" className="bg-blue-500/20 p-1 rounded">
                                <Clock className="h-4 w-4 text-blue-400" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-white/70">
                          {new Date(file.createdAt).toLocaleDateString("zh-CN")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyShareLink(file.shareToken)}
                              title="复制分享链接"
                              className="hover:bg-white/10 text-white/70 hover:text-white"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(file.id, file.filename)}
                              title="删除文件"
                              className="hover:bg-red-500/20 text-white/70 hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
