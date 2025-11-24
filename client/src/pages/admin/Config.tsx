import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_LOGO, APP_TITLE } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Save } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export default function AdminConfig() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const { data: config, isLoading } = trpc.admin.getConfig.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const [maxFileSize, setMaxFileSize] = useState("50");
  const [uploadSpeedLimit, setUploadSpeedLimit] = useState("10");
  const [downloadSpeedLimit, setDownloadSpeedLimit] = useState("10");
  const [autoCleanDays, setAutoCleanDays] = useState("30");

  useEffect(() => {
    if (config) {
      setMaxFileSize(config.maxFileSize || "50");
      setUploadSpeedLimit(config.uploadSpeedLimit || "10");
      setDownloadSpeedLimit(config.downloadSpeedLimit || "10");
      setAutoCleanDays(config.autoCleanDays || "30");
    }
  }, [config]);

  const updateConfigMutation = trpc.admin.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("配置已更新");
      utils.admin.getConfig.invalidate();
    },
    onError: (error) => {
      toast.error(`更新失败: ${error.message}`);
    },
  });

  const handleSave = (key: string, value: string, description: string) => {
    updateConfigMutation.mutate({ key, value, description });
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

        <div className="max-w-2xl mx-auto space-y-6">
          <Card className="bg-white/10 backdrop-blur-md border-white/20">
            <CardHeader>
              <CardTitle className="text-white">系统配置</CardTitle>
              <CardDescription className="text-white/70">
                配置系统参数和限制
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <p className="text-center text-white/70 py-8">加载中...</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="maxFileSize" className="text-white">
                      最大文件大小 (MB)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="maxFileSize"
                        type="number"
                        value={maxFileSize}
                        onChange={(e) => setMaxFileSize(e.target.value)}
                        className="bg-white/10 border-white/20 text-white"
                      />
                      <Button
                        onClick={() =>
                          handleSave("maxFileSize", maxFileSize, "最大文件大小限制(MB)")
                        }
                        disabled={updateConfigMutation.isPending}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-white/50">
                      单个文件的最大上传大小限制
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="uploadSpeedLimit" className="text-white">
                      上传速度限制 (MB/s)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="uploadSpeedLimit"
                        type="number"
                        value={uploadSpeedLimit}
                        onChange={(e) => setUploadSpeedLimit(e.target.value)}
                        className="bg-white/10 border-white/20 text-white"
                      />
                      <Button
                        onClick={() =>
                          handleSave(
                            "uploadSpeedLimit",
                            uploadSpeedLimit,
                            "上传速度限制(MB/s)"
                          )
                        }
                        disabled={updateConfigMutation.isPending}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-white/50">
                      用户上传文件的速度限制 (设置为 0 表示不限速)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="downloadSpeedLimit" className="text-white">
                      下载速度限制 (MB/s)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="downloadSpeedLimit"
                        type="number"
                        value={downloadSpeedLimit}
                        onChange={(e) => setDownloadSpeedLimit(e.target.value)}
                        className="bg-white/10 border-white/20 text-white"
                      />
                      <Button
                        onClick={() =>
                          handleSave(
                            "downloadSpeedLimit",
                            downloadSpeedLimit,
                            "下载速度限制(MB/s)"
                          )
                        }
                        disabled={updateConfigMutation.isPending}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-white/50">
                      用户下载文件的速度限制 (设置为 0 表示不限速)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="autoCleanDays" className="text-white">
                      自动清理周期 (天)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="autoCleanDays"
                        type="number"
                        value={autoCleanDays}
                        onChange={(e) => setAutoCleanDays(e.target.value)}
                        className="bg-white/10 border-white/20 text-white"
                      />
                      <Button
                        onClick={() =>
                          handleSave(
                            "autoCleanDays",
                            autoCleanDays,
                            "自动清理过期文件的周期(天)"
                          )
                        }
                        disabled={updateConfigMutation.isPending}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-white/50">
                      系统自动清理过期文件的时间间隔
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-md border-white/20">
            <CardHeader>
              <CardTitle className="text-white">说明</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-white/70">
              <p>• 修改配置后需要点击保存按钮才会生效</p>
              <p>• 速度限制为0表示不限制</p>
              <p>• 自动清理功能会定期删除已过期的文件</p>
              <p>• 配置更改会立即应用到新的上传和下载操作</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
