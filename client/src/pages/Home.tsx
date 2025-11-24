import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { APP_LOGO, APP_TITLE, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Upload, Link as LinkIcon, Moon, Sun, FileText, Shield, Clock, Zap, History } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { UserMenu } from "@/components/UserMenu";
import { useTheme } from "@/contexts/ThemeContext";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";

type HistoryItem = {
  filename: string;
  shareUrl: string;
  createdAt: number;
};

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [burnAfterRead, setBurnAfterRead] = useState(false);
  const [expiresIn, setExpiresIn] = useState({
    years: 0,
    months: 0,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [uploading, setUploading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState("");
  
  // Refs for upload control
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadStateRef = useRef<{
    uploadId: string;
    chunkIndex: number;
    totalChunks: number;
    chunkSize: number;
    startTime: number;
    uploadedBytes: number;
    filename: string;
    fileSize: number;
    lastSpeedCheckTime: number;
    lastSpeedCheckBytes: number;
  } | null>(null);

  // Fetch public config
  const { data: publicConfig } = trpc.public.getConfig.useQuery();
  const maxFileSizeMB = publicConfig?.maxFileSize || 50;

  // Mutations
  const initUploadMutation = trpc.files.initUpload.useMutation();
  const mergeUploadMutation = trpc.files.mergeUpload.useMutation();

  useEffect(() => {
    const saved = localStorage.getItem("upload_history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const processUpload = async () => {
    if (!file || !uploadStateRef.current) return;
    
    const { uploadId, totalChunks, chunkSize } = uploadStateRef.current;
    
    setUploading(true);
    setPaused(false);
    abortControllerRef.current = new AbortController();
    
    // Reset start time for accurate speed calc on resume
    uploadStateRef.current.startTime = Date.now();
    uploadStateRef.current.lastSpeedCheckTime = Date.now();
    uploadStateRef.current.lastSpeedCheckBytes = uploadStateRef.current.uploadedBytes;

    try {
      // Resume from current chunk index
      for (let i = uploadStateRef.current.chunkIndex; i < totalChunks; i++) {
        if (abortControllerRef.current?.signal.aborted) {
          return; // Stop if paused/aborted
        }

        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        
        // Upload chunk
        const response = await fetch(`/api/upload/chunk/${uploadId}/${i}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: chunk,
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Chunk ${i} upload failed`);
        }

        // Update state
        uploadStateRef.current.chunkIndex = i + 1;
        uploadStateRef.current.uploadedBytes += chunk.size;
        
        // Save state for resume
        localStorage.setItem("current_upload", JSON.stringify(uploadStateRef.current));
        
        // Update progress
        const percent = (uploadStateRef.current.uploadedBytes / file.size) * 100;
        setUploadProgress(percent);
        
        // Update speed
        const now = Date.now();
        const timeDiff = (now - uploadStateRef.current.lastSpeedCheckTime) / 1000; // seconds
        
        // Update speed every 1 second or if it's the last chunk
        if (timeDiff >= 1 || i === totalChunks - 1) {
          const bytesDiff = uploadStateRef.current.uploadedBytes - uploadStateRef.current.lastSpeedCheckBytes;
          const speedBytesPerSec = bytesDiff / timeDiff;
          
          let speedStr = "";
          if (speedBytesPerSec < 1024) speedStr = `${speedBytesPerSec.toFixed(0)} B/s`;
          else if (speedBytesPerSec < 1024 * 1024) speedStr = `${(speedBytesPerSec / 1024).toFixed(2)} KB/s`;
          else speedStr = `${(speedBytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
          
          setUploadSpeed(speedStr);
          
          uploadStateRef.current.lastSpeedCheckTime = now;
          uploadStateRef.current.lastSpeedCheckBytes = uploadStateRef.current.uploadedBytes;
        }
      }

      // Merge
      const result = await mergeUploadMutation.mutateAsync({ uploadId });
      
      setShareUrl(result.shareUrl);
      toast.success("文件上传成功！");
      setUploading(false);
      setPaused(false);
      uploadStateRef.current = null;
      localStorage.removeItem("current_upload");
      
      // Save to history
      const newItem: HistoryItem = {
        filename: file.name,
        shareUrl: result.shareUrl,
        createdAt: Date.now(),
      };
      const newHistory = [newItem, ...history].slice(0, 10);
      setHistory(newHistory);
      localStorage.setItem("upload_history", JSON.stringify(newHistory));

    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Paused
        setPaused(true);
        setUploading(false);
      } else {
        console.error(error);
        toast.error(`上传失败: ${error.message}`);
        setUploading(false);
        setPaused(true); // Allow retry
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setShareUrl("");
      
      // Check for existing session
      const savedUpload = localStorage.getItem("current_upload");
      if (savedUpload) {
        try {
          const state = JSON.parse(savedUpload);
          if (state.filename === selectedFile.name && state.fileSize === selectedFile.size) {
            // Found matching session
            uploadStateRef.current = state;
            setPaused(true); // Start in paused state, user can click "Resume"
            setUploading(false); // UI shows "Resume" button
            
            // Calculate progress
            const percent = (state.uploadedBytes / state.fileSize) * 100;
            setUploadProgress(percent);
            toast.info("发现未完成的上传任务，您可以继续上传");
            return;
          }
        } catch (e) {}
      }

      // Reset upload state if no match
      uploadStateRef.current = null;
      setUploadProgress(0);
      setUploadSpeed("");
      setPaused(false);
      setUploading(false);
      localStorage.removeItem("current_upload");
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      setFile(selectedFile);
      setShareUrl("");
      
      // Check for existing session
      const savedUpload = localStorage.getItem("current_upload");
      if (savedUpload) {
        try {
          const state = JSON.parse(savedUpload);
          if (state.filename === selectedFile.name && state.fileSize === selectedFile.size) {
            uploadStateRef.current = state;
            setPaused(true);
            setUploading(false);
            const percent = (state.uploadedBytes / state.fileSize) * 100;
            setUploadProgress(percent);
            toast.info("发现未完成的上传任务，您可以继续上传");
            return;
          }
        } catch (e) {}
      }

      uploadStateRef.current = null;
      setUploadProgress(0);
      setUploadSpeed("");
      setPaused(false);
      setUploading(false);
      localStorage.removeItem("current_upload");
    }
  }, []);

  const handleUpload = async () => {
    if (!file) {
      toast.error("请选择文件");
      return;
    }

    // Check file size
    const maxSize = maxFileSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`文件大小不能超过 ${maxFileSizeMB}MB`);
      return;
    }

    // If paused, resume
    if (paused && uploadStateRef.current) {
      processUpload();
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadSpeed("");

    try {
      // Calculate total seconds
      const totalSeconds = 
        (expiresIn.years * 365 * 24 * 60 * 60) +
        (expiresIn.months * 30 * 24 * 60 * 60) +
        (expiresIn.days * 24 * 60 * 60) +
        (expiresIn.hours * 60 * 60) +
        (expiresIn.minutes * 60) +
        expiresIn.seconds;

      // Init upload
      // We use a default chunk size of 2MB for calculation, but server returns authoritative size
      const estimatedChunks = Math.ceil(file.size / (2 * 1024 * 1024));
      
      const { uploadId, chunkSize } = await initUploadMutation.mutateAsync({
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        totalChunks: estimatedChunks,
        password: password || undefined,
        burnAfterRead,
        expiresInSeconds: totalSeconds > 0 ? totalSeconds : undefined,
      });

      // Initialize state
      uploadStateRef.current = {
        uploadId,
        chunkIndex: 0,
        totalChunks: Math.ceil(file.size / chunkSize),
        chunkSize,
        startTime: Date.now(),
        uploadedBytes: 0,
        filename: file.name,
        fileSize: file.size,
        lastSpeedCheckTime: Date.now(),
        lastSpeedCheckBytes: 0,
      };
      
      localStorage.setItem("current_upload", JSON.stringify(uploadStateRef.current));

      processUpload();

    } catch (error: any) {
      console.error("Upload init error:", error);
      setUploading(false);
      toast.error(`初始化失败: ${error.message}`);
    }
  };

  const handlePause = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };


  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    toast.success("链接已复制到剪贴板");
  };

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return "永久有效";
    const units = [
      { label: "年", value: 365 * 24 * 60 * 60 },
      { label: "个月", value: 30 * 24 * 60 * 60 },
      { label: "天", value: 24 * 60 * 60 },
      { label: "小时", value: 60 * 60 },
      { label: "分", value: 60 },
      { label: "秒", value: 1 },
    ];
    
    let remaining = seconds;
    const parts = [];
    
    for (const unit of units) {
      if (remaining >= unit.value) {
        const count = Math.floor(remaining / unit.value);
        parts.push(`${count}${unit.label}`);
        remaining %= unit.value;
      }
    }
    
    return parts.join(" ") || "0秒";
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden transition-colors duration-300">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-cyan-600/10 blur-[120px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[30%] h-[30%] rounded-full bg-indigo-600/10 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
              <img src={APP_LOGO} alt="Logo" className="relative h-8 w-8 rounded-lg" />
            </div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">{APP_TITLE}</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground hover:text-foreground hover:bg-accent">
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            {isAuthenticated ? (
              <>
                <Link href="/my-files">
                  <Button variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-accent">我的文件</Button>
                </Link>
                {user?.role === "admin" && (
                  <Link href="/admin">
                    <Button variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-accent">管理后台</Button>
                  </Link>
                )}
                <UserMenu />
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button variant="default">登录</Button>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-foreground via-blue-500 to-cyan-500 mb-6 tracking-tight">
            快速、安全的文件分享
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            简单拖拽，即刻分享。支持密码保护、阅后即焚、自动过期等高级功能，
            让您的文件传输更加安全无忧。
          </p>
        </motion.div>

        {/* Upload Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="max-w-2xl mx-auto bg-card/50 backdrop-blur-xl border-border shadow-2xl">
            <CardHeader>
              <CardTitle className="text-foreground text-2xl">上传文件</CardTitle>
              <CardDescription className="text-muted-foreground">
                支持最大 {maxFileSizeMB}MB 的文件上传
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Drop Zone */}
              <div
                className={`relative group border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 cursor-pointer ${
                  dragActive
                    ? "border-blue-400 bg-blue-500/20 scale-[1.02]"
                    : "border-border hover:border-primary/50 hover:bg-accent"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <Upload className={`h-16 w-16 mx-auto mb-6 transition-colors duration-300 ${dragActive ? "text-blue-400" : "text-muted-foreground group-hover:text-foreground"}`} />
                <p className="text-lg text-foreground font-medium mb-2">
                  {file ? file.name : "点击或拖拽文件到这里"}
                </p>
                <p className="text-sm text-muted-foreground">支持任意类型文件</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Options */}
              <div className="grid md:grid-cols-2 gap-6 p-4 bg-accent/20 rounded-lg border border-border">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground">密码保护</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="留空则不设置"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-background border-input text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label className="text-foreground">有效期</Label>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {[
                      { label: "年", key: "years" },
                      { label: "月", key: "months" },
                      { label: "天", key: "days" },
                      { label: "时", key: "hours" },
                      { label: "分", key: "minutes" },
                      { label: "秒", key: "seconds" },
                    ].map((unit) => (
                      <div key={unit.key} className="relative">
                        <Input
                          type="number"
                          min="0"
                          value={expiresIn[unit.key as keyof typeof expiresIn]}
                          onChange={(e) => setExpiresIn(prev => ({ ...prev, [unit.key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="bg-background border-input text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 pr-8"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                          {unit.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    当前设置: <span className="text-primary">{formatDuration(
                      (expiresIn.years * 365 * 24 * 60 * 60) +
                      (expiresIn.months * 30 * 24 * 60 * 60) +
                      (expiresIn.days * 24 * 60 * 60) +
                      (expiresIn.hours * 60 * 60) +
                      (expiresIn.minutes * 60) +
                      expiresIn.seconds
                    )}</span>
                  </p>
                </div>

                <div className="flex items-center justify-between md:col-span-2 pt-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="burn" className="text-foreground text-base">阅后即焚</Label>
                    <p className="text-xs text-muted-foreground">文件被下载一次后自动删除</p>
                  </div>
                  <Switch
                    id="burn"
                    checked={burnAfterRead}
                    onCheckedChange={setBurnAfterRead}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              </div>

              {/* Upload Button */}
              <div className="space-y-2">
                {!uploading && !paused ? (
                  <Button
                    onClick={handleUpload}
                    disabled={!file}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg shadow-blue-500/25 border-0 h-12 text-lg font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    开始上传
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      onClick={paused ? handleUpload : handlePause}
                      className={`flex-1 text-white shadow-lg border-0 h-12 text-lg font-medium transition-all duration-300 ${
                        paused 
                          ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 shadow-green-500/25" 
                          : "bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 shadow-yellow-500/25"
                      }`}
                    >
                      {paused ? "继续上传" : "暂停上传"}
                    </Button>
                    <Button
                      onClick={() => {
                        handlePause();
                        setUploading(false);
                        setPaused(false);
                        setUploadProgress(0);
                        uploadStateRef.current = null;
                      }}
                      variant="destructive"
                      className="h-12 px-6"
                    >
                      取消
                    </Button>
                  </div>
                )}
                
                {(uploading || paused) && (
                  <div className="space-y-1">
                    <Progress value={uploadProgress} className="h-2 bg-white/10" />
                    <div className="flex justify-between text-xs text-white/50">
                      <span>{uploadProgress.toFixed(0)}% {paused && "(已暂停)"}</span>
                      <span>{uploadSpeed}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Share URL */}
              {shareUrl && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-2 pt-4 border-t border-white/10"
                >
                  <Label className="text-white">分享链接生成成功！</Label>
                  <div className="flex gap-2">
                    <Input
                      value={shareUrl}
                      readOnly
                      className="bg-green-500/10 border-green-500/30 text-green-200 font-mono text-sm"
                    />
                    <Button onClick={copyToClipboard} variant="outline" className="border-green-500/30 text-green-400 hover:bg-green-500/10 hover:text-green-300">
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Features */}
        <div className="grid md:grid-cols-4 gap-6 mt-20 max-w-6xl mx-auto">
          {[
            { icon: Shield, title: "密码保护", desc: "为文件设置访问密码，确保只有授权人员可以访问", color: "text-blue-400", delay: 0.3 },
            { icon: Zap, title: "阅后即焚", desc: "开启阅后即焚模式，文件在被下载一次后立即永久删除", color: "text-yellow-400", delay: 0.4 },
            { icon: Clock, title: "自动过期", desc: "自定义文件有效期，过期后自动清理，无需手动管理", color: "text-cyan-400", delay: 0.5 },
            { icon: FileText, title: "文件预览", desc: "支持常见图片、PDF等格式的在线预览，无需下载即可查看", color: "text-green-400", delay: 0.6 },
          ].map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: feature.delay }}
            >
              <Card className="bg-card/50 backdrop-blur-sm border-border hover:bg-accent/50 transition-colors duration-300 h-full">
                <CardContent className="pt-8 text-center">
                  <div className={`inline-flex p-3 rounded-2xl bg-accent/50 mb-4 ${feature.color}`}>
                    <feature.icon className="h-8 w-8" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg mb-3">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Upload History */}
        {history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="mt-20 max-w-4xl mx-auto"
          >
            <div className="flex items-center gap-2 mb-6 justify-center">
              <History className="h-6 w-6 text-muted-foreground" />
              <h3 className="text-2xl font-bold text-foreground">上传历史</h3>
            </div>
            <div className="grid gap-4">
              {history.map((item, index) => (
                <a 
                  key={index} 
                  href={item.shareUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <Card className="bg-card/50 backdrop-blur-sm border-border hover:bg-accent/50 transition-all duration-300">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-blue-500/20 text-blue-300">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-foreground font-medium group-hover:text-primary transition-colors">
                            {item.filename}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString("zh-CN")}
                          </p>
                        </div>
                      </div>
                      <div className="text-muted-foreground group-hover:text-foreground transition-colors">
                        <LinkIcon className="h-5 w-5" />
                      </div>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
            <div className="text-center mt-4">
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setHistory([]);
                  localStorage.removeItem("upload_history");
                  toast.success("历史记录已清空");
                }}
              >
                清空历史记录
              </Button>
            </div>
          </motion.div>
        )}
      </section>
    </div>
  );
}
