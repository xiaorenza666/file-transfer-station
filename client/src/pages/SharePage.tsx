import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_LOGO, APP_TITLE } from "@/const";
import { trpc } from "@/lib/trpc";
import { Download, Lock, AlertTriangle, FileIcon, Image as ImageIcon, FileText } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRoute, Link } from "wouter";
import { renderAsync } from "docx-preview";
import { keepPreviousData } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";

export default function SharePage() {
  const [, params] = useRoute("/share/:token");
  const token = params?.token || "";
  const [inputPassword, setInputPassword] = useState("");
  const [queryPassword, setQueryPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [fileInfo, setFileInfo] = useState<any>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);
  
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const downloadStateRef = useRef<{
    fileHandle: any;
    receivedLength: number;
    totalLength: number;
    filename: string;
    fileUrl: string;
  } | null>(null);

  const { data, isLoading, error, refetch, isFetching } = trpc.files.getByShareToken.useQuery(
    { shareToken: token, password: queryPassword || undefined },
    { 
      enabled: !!token, 
      retry: false,
      placeholderData: keepPreviousData
    }
  );

  const downloadMutation = trpc.files.download.useMutation();

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(2)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  };

  const processDownload = async (resume = false) => {
    if (!downloadStateRef.current) return;
    const { fileHandle, receivedLength, totalLength, fileUrl } = downloadStateRef.current;

    setIsDownloading(true);
    setIsPaused(false);
    abortControllerRef.current = new AbortController();

    try {
      const headers: HeadersInit = {};
      if (resume && receivedLength > 0) {
        headers['Range'] = `bytes=${receivedLength}-`;
      }

      const response = await fetch(fileUrl, {
        headers,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error("Download failed");

      if (!resume) {
         const contentLength = response.headers.get('content-length');
         downloadStateRef.current.totalLength = contentLength ? parseInt(contentLength, 10) : 0;
      }

      // Create writer - append if resuming
      const writable = await fileHandle.createWritable({ keepExistingData: resume });
      
      if (resume) {
        await writable.seek(receivedLength);
      }

      const reader = response.body!.getReader();
      let lastCheckTime = Date.now();
      let lastCheckBytes = receivedLength;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        await writable.write(value);
        downloadStateRef.current.receivedLength += value.length;
        const currentReceived = downloadStateRef.current.receivedLength;
        const total = downloadStateRef.current.totalLength;

        if (total > 0) {
          setDownloadProgress((currentReceived / total) * 100);
        }

        const now = Date.now();
        const timeDiff = (now - lastCheckTime) / 1000;
        if (timeDiff >= 0.5) {
          const bytesDiff = currentReceived - lastCheckBytes;
          const speed = bytesDiff / timeDiff;
          setDownloadSpeed(formatSpeed(speed));
          lastCheckTime = now;
          lastCheckBytes = currentReceived;
        }
      }

      await writable.close();
      toast.success("下载完成");
      setIsDownloading(false);
      setIsPaused(false);
      setDownloadProgress(100);
      downloadStateRef.current = null;
      
      setTimeout(() => refetch(), 2000);

    } catch (e: any) {
      if (e.name === 'AbortError') {
         setIsPaused(true);
         setIsDownloading(false);
         return;
      }
      console.error(e);
      toast.error("下载出错: " + e.message);
      setIsDownloading(false);
      setIsPaused(true); // Allow retry
    }
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    
    // Resume if paused
    if (isPaused && downloadStateRef.current) {
      processDownload(true);
      return;
    }

    try {
      const { fileUrl, filename } = await downloadMutation.mutateAsync({
        shareToken: token,
        password: queryPassword || undefined,
      });

      const supportsFileSystem = 'showSaveFilePicker' in window;

      if (supportsFileSystem) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
          });
          
          downloadStateRef.current = {
            fileHandle,
            receivedLength: 0,
            totalLength: 0,
            filename,
            fileUrl
          };

          processDownload(false);

        } catch (e: any) {
          if (e.name === 'AbortError' || e.name === 'NotAllowedError') {
             return;
          }
          console.error(e);
          toast.error("高级下载失败，切换至普通下载");
          window.location.href = fileUrl;
        }
      } else {
        toast.info("您的浏览器不支持高级下载监控，将使用默认下载");
        window.location.href = fileUrl;
        setTimeout(() => refetch(), 2000);
      }
    } catch (error: any) {
      toast.error(`下载失败: ${error.message}`);
    }
  };

  const handlePause = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsDownloading(false);
    setIsPaused(false);
    setDownloadProgress(0);
    downloadStateRef.current = null;
    toast.info("下载已取消");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  useEffect(() => {
    if (data) {
      if (data.requiresPassword && !data.passwordValid) {
        setShowPasswordInput(true);
      } else if (data.file) {
        setFileInfo(data.file);
        setShowPasswordInput(false);
        
        // Handle previews
        if (data.file.fileUrl) {
          const mimeType = data.file.mimeType || '';
          
          // Text preview
          if (mimeType.startsWith('text/') || ['application/json', 'application/xml', 'application/javascript'].includes(mimeType)) {
            fetch(data.file.fileUrl)
              .then(res => res.text())
              .then(text => setTextContent(text))
              .catch(err => console.error("Failed to load text content", err));
          }
          
          // Word preview
          if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && docxContainerRef.current) {
             fetch(data.file.fileUrl)
              .then(res => res.blob())
              .then(blob => {
                if (docxContainerRef.current) {
                  renderAsync(blob, docxContainerRef.current, docxContainerRef.current, {
                    className: "docx-viewer",
                    inWrapper: true,
                    ignoreWidth: false,
                    ignoreHeight: false,
                    ignoreFonts: false,
                    breakPages: true,
                    ignoreLastRenderedPageBreak: true,
                    experimental: false,
                    trimXmlDeclaration: true,
                    useBase64URL: false,
                    debug: false,
                  });
                }
              })
              .catch(err => console.error("Failed to render docx", err));
          }
        }
      }
    }
  }, [data]);

  // Re-run docx render when container becomes available (e.g. after state update)
  useEffect(() => {
    if (fileInfo?.fileUrl && fileInfo.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && docxContainerRef.current) {
       fetch(fileInfo.fileUrl)
        .then(res => res.blob())
        .then(blob => {
          if (docxContainerRef.current) {
             // Clear previous content
             docxContainerRef.current.innerHTML = '';
             renderAsync(blob, docxContainerRef.current, docxContainerRef.current, {
                className: "docx-viewer",
                inWrapper: true
             });
          }
        });
    }
  }, [fileInfo, docxContainerRef.current]);

  const handlePasswordSubmit = () => {
    if (!inputPassword) {
      toast.error("请输入密码");
      return;
    }
    setQueryPassword(inputPassword);
  };

  // Effect to show error toast when password validation fails
  useEffect(() => {
    if (!isFetching && data && data.requiresPassword && !data.passwordValid && queryPassword) {
      toast.error("密码错误，请重试");
      setQueryPassword(""); // Reset query password to allow retry
    }
  }, [isFetching, data, queryPassword]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center">
        <Card className="w-full max-w-md bg-white/10 backdrop-blur-md border-white/20">
          <CardContent className="pt-6">
            <p className="text-center text-white">加载中...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || (!data && !isLoading)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center">
        <Card className="w-full max-w-md bg-white/10 backdrop-blur-md border-white/20">
          <CardHeader>
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-400" />
            <CardTitle className="text-center text-white">文件不存在</CardTitle>
            <CardDescription className="text-center text-white/70">
              该文件可能已被删除或已过期
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button className="w-full" variant="outline">返回首页</Button>
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
      <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <Card className="w-full max-w-4xl bg-white/10 backdrop-blur-md border-white/20">
          {showPasswordInput ? (
            <>
              <CardHeader>
                <Lock className="h-12 w-12 mx-auto mb-4 text-blue-400" />
                <CardTitle className="text-center text-white">此文件受密码保护</CardTitle>
                <CardDescription className="text-center text-white/70">
                  请输入密码以访问文件
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-w-md mx-auto">
                <div>
                  <Label htmlFor="password" className="text-white">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="输入访问密码"
                    value={inputPassword}
                    onChange={(e) => setInputPassword(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handlePasswordSubmit()}
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  />
                </div>
                <Button onClick={handlePasswordSubmit} className="w-full bg-blue-600 hover:bg-blue-500" disabled={isFetching}>
                  {isFetching ? "验证中..." : "确认"}
                </Button>
              </CardContent>
            </>
          ) : fileInfo ? (
            <>
              <CardHeader>
                <div className="flex items-center justify-center mb-4">
                  {fileInfo.mimeType?.startsWith("image/") ? (
                    <ImageIcon className="h-16 w-16 text-blue-400" />
                  ) : (
                    <FileIcon className="h-16 w-16 text-blue-400" />
                  )}
                </div>
                <CardTitle className="text-center text-white">{fileInfo.filename}</CardTitle>
                <CardDescription className="text-center text-white/70">
                  {formatFileSize(fileInfo.fileSize)} • 下载 {fileInfo.downloadCount} 次
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* File Preview */}
                {fileInfo.fileUrl && (
                  <div className="mb-6 bg-white rounded-lg overflow-hidden min-h-[200px] flex items-center justify-center relative">
                    {/* Image */}
                    {(fileInfo.mimeType?.startsWith('image/') || fileInfo.filename.toLowerCase().endsWith('.svg')) && (
                      <img src={fileInfo.fileUrl} alt={fileInfo.filename} className="max-w-full max-h-[600px] object-contain" />
                    )}
                    
                    {/* Video */}
                    {fileInfo.mimeType?.startsWith('video/') && (
                      <video src={fileInfo.fileUrl} controls className="w-full max-h-[600px]" />
                    )}
                    
                    {/* Audio */}
                    {fileInfo.mimeType?.startsWith('audio/') && (
                      <div className="w-full p-8">
                        <audio src={fileInfo.fileUrl} controls className="w-full" />
                      </div>
                    )}
                    
                    {/* PDF */}
                    {(fileInfo.mimeType === 'application/pdf' || fileInfo.filename.toLowerCase().endsWith('.pdf')) && (
                      <object data={fileInfo.fileUrl} type="application/pdf" className="w-full h-[600px]">
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                          <p>无法在线预览 PDF</p>
                          <a href={fileInfo.fileUrl} download className="text-blue-500 hover:underline mt-2">点击下载</a>
                        </div>
                      </object>
                    )}
                    
                    {/* Text / Code */}
                    {(fileInfo.mimeType?.startsWith('text/') || ['application/json', 'application/xml', 'application/javascript'].includes(fileInfo.mimeType || '')) && (
                      <div className="w-full h-[500px] overflow-auto p-4 bg-gray-50 text-gray-900 font-mono text-sm whitespace-pre-wrap text-left">
                        {textContent || "加载中..."}
                      </div>
                    )}

                    {/* Word (.docx) */}
                    {fileInfo.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && (
                       <div ref={docxContainerRef} className="w-full h-[600px] overflow-auto bg-white p-4 text-black" />
                    )}
                    
                    {/* Fallback for other types */}
                    {!fileInfo.mimeType?.startsWith('image/') && 
                     !fileInfo.filename.toLowerCase().endsWith('.svg') &&
                     !fileInfo.mimeType?.startsWith('video/') && 
                     !fileInfo.mimeType?.startsWith('audio/') && 
                     !fileInfo.mimeType?.startsWith('text/') && 
                     fileInfo.mimeType !== 'application/pdf' &&
                     !fileInfo.filename.toLowerCase().endsWith('.pdf') &&
                     fileInfo.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
                     !['application/json', 'application/xml', 'application/javascript'].includes(fileInfo.mimeType || '') && (
                      <div className="text-gray-500 p-8 flex flex-col items-center">
                        <FileText className="h-12 w-12 mb-2 opacity-50" />
                        <p>此文件类型不支持在线预览，请下载后查看</p>
                      </div>
                    )}
                  </div>
                )}

                {fileInfo.burnAfterRead && (
                  <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-yellow-400">阅后即焚</p>
                      <p className="text-xs text-white/70">此文件下载后将自动删除（不支持预览）</p>
                    </div>
                  </div>
                )}

                {!isDownloading && !isPaused ? (
                  <Button
                    onClick={handleDownload}
                    disabled={downloadMutation.isPending}
                    className="w-full max-w-md mx-auto block"
                    size="lg"
                  >
                    <div className="flex items-center justify-center">
                      <Download className="h-5 w-5 mr-2" />
                      {downloadMutation.isPending ? "准备下载..." : "下载文件"}
                    </div>
                  </Button>
                ) : (
                  <div className="flex gap-2 max-w-md mx-auto">
                    <Button
                      onClick={isPaused ? handleDownload : handlePause}
                      className={`flex-1 text-white shadow-lg border-0 h-12 text-lg font-medium transition-all duration-300 ${
                        isPaused 
                          ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 shadow-green-500/25" 
                          : "bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 shadow-yellow-500/25"
                      }`}
                    >
                      {isPaused ? "继续下载" : "暂停下载"}
                    </Button>
                    <Button
                      onClick={handleCancel}
                      variant="destructive"
                      className="h-12 px-6"
                    >
                      取消
                    </Button>
                  </div>
                )}
                
                {(isDownloading || isPaused) && (
                  <div className="max-w-md mx-auto space-y-1 mt-4">
                    <Progress value={downloadProgress} className="h-2 bg-white/10" />
                    <div className="flex justify-between text-xs text-white/50">
                      <span>{downloadProgress.toFixed(0)}% {isPaused && "(已暂停)"}</span>
                      <span>{downloadSpeed}</span>
                    </div>
                  </div>
                )}
                
                <div className="text-center text-sm text-white/50 space-y-1">
                  <p>上传于 {new Date(fileInfo.createdAt).toLocaleString("zh-CN")}</p>
                  <p className="text-xs text-white/30">支持断点续传，可使用浏览器下载管理器暂停/继续</p>
                </div>
              </CardContent>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}


