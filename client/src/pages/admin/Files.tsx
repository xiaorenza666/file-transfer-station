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
import { APP_LOGO, APP_TITLE } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Trash2, Copy } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function AdminFiles() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const { data: files, isLoading } = trpc.admin.files.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const deleteMutation = trpc.files.delete.useMutation({
    onSuccess: () => {
      toast.success("文件已删除");
      utils.admin.files.invalidate();
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
            <CardTitle className="text-white">文件管理</CardTitle>
            <CardDescription className="text-white/70">
              查看和管理所有文件
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center text-white/70 py-8">加载中...</p>
            ) : !files || files.length === 0 ? (
              <p className="text-center text-white/70 py-8">暂无文件</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-white/5">
                      <TableHead className="text-white/90">ID</TableHead>
                      <TableHead className="text-white/90">文件名</TableHead>
                      <TableHead className="text-white/90">用户ID</TableHead>
                      <TableHead className="text-white/90">大小</TableHead>
                      <TableHead className="text-white/90">下载次数</TableHead>
                      <TableHead className="text-white/90">状态</TableHead>
                      <TableHead className="text-white/90">上传时间</TableHead>
                      <TableHead className="text-white/90 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((file) => (
                      <TableRow key={file.id} className="border-white/10 hover:bg-white/5">
                        <TableCell className="text-white/70">{file.id}</TableCell>
                        <TableCell className="font-medium text-white">
                          {file.filename}
                        </TableCell>
                        <TableCell className="text-white/70">
                          {file.userId || "游客"}
                        </TableCell>
                        <TableCell className="text-white/70">
                          {formatFileSize(file.fileSize)}
                        </TableCell>
                        <TableCell className="text-white/70">
                          {file.downloadCount}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              file.status === "active"
                                ? "bg-green-500/20 text-green-400"
                                : file.status === "deleted"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-yellow-500/20 text-yellow-400"
                            }`}
                          >
                            {file.status === "active"
                              ? "活跃"
                              : file.status === "deleted"
                              ? "已删除"
                              : "已过期"}
                          </span>
                        </TableCell>
                        <TableCell className="text-white/70">
                          {new Date(file.createdAt).toLocaleDateString("zh-CN")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {file.status === "active" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => copyShareLink(file.shareToken)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                            {file.status === "active" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(file.id, file.filename)}
                              >
                                <Trash2 className="h-4 w-4 text-red-400" />
                              </Button>
                            )}
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
      </div>
    </div>
  );
}
