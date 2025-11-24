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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_LOGO, APP_TITLE } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Globe } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState, useRef } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Mock function to get lat/lng from IP
// In a real app, this would call a backend service or external API
// For demo, we'll generate deterministic random coordinates based on IP hash
const getGeoFromIP = (ip: string) => {
  if (!ip || ip === '::1' || ip === '127.0.0.1') {
    // Default to Beijing for localhost
    return { lat: 39.9042, lng: 116.4074, city: "Localhost" };
  }
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash) + ip.charCodeAt(i);
    hash |= 0;
  }
  
  // Generate pseudo-random coordinates
  // This is just for visualization demo purposes
  const lat = (Math.abs(hash) % 160) - 80;
  const lng = (Math.abs(hash >> 8) % 360) - 180;
  
  return { lat, lng, city: ip };
};

export default function AdminLogs() {
  const { user, isAuthenticated } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [globeData, setGlobeData] = useState<any[]>([]);
  const [dimensions, setDimensions] = useState({ width: 1000, height: 400 });

  const { data: auditLogs, isLoading: auditLoading } = trpc.admin.auditLogs.useQuery(
    { limit: 100 },
    { enabled: isAuthenticated && user?.role === "admin" }
  );

  const { data: accessLogs, isLoading: accessLoading } = trpc.admin.accessLogs.useQuery(
    { limit: 100 },
    { enabled: isAuthenticated && user?.role === "admin" }
  );

  useEffect(() => {
    if (accessLogs) {
      const points = accessLogs
        .filter(log => log.ipAddress)
        .map(log => {
          const geo = getGeoFromIP(log.ipAddress!);
          return {
            lat: geo.lat,
            lng: geo.lng,
            size: 0.5,
            color: log.accessType === 'download' ? '#4ade80' : '#60a5fa',
            label: `${geo.city} (${log.accessType})`
          };
        });
      setGlobeData(points);
    }
  }, [accessLogs]);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };

    window.addEventListener('resize', updateDimensions);
    // Delay initial measure to ensure container is rendered
    setTimeout(updateDimensions, 100);

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Auto-rotate effect removed

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md bg-card border-border">
          <CardHeader>
            <CardTitle className="text-center text-foreground">权限不足</CardTitle>
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
    <div className="min-h-screen bg-background transition-colors duration-300">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <img src={APP_LOGO} alt="Logo" className="h-8 w-8" />
              <h1 className="text-xl font-bold text-foreground">{APP_TITLE}</h1>
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

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">系统日志</CardTitle>
            <CardDescription className="text-muted-foreground">
              查看审计日志和访问记录
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="audit" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-muted">
                <TabsTrigger value="audit">审计日志</TabsTrigger>
                <TabsTrigger value="access">访问日志</TabsTrigger>
              </TabsList>

              <TabsContent value="audit" className="mt-6">
                {auditLoading ? (
                  <p className="text-center text-muted-foreground py-8">加载中...</p>
                ) : !auditLogs || auditLogs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">暂无审计日志</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border hover:bg-muted/50">
                          <TableHead className="text-muted-foreground">时间</TableHead>
                          <TableHead className="text-muted-foreground">用户ID</TableHead>
                          <TableHead className="text-muted-foreground">操作</TableHead>
                          <TableHead className="text-muted-foreground">目标类型</TableHead>
                          <TableHead className="text-muted-foreground">目标ID</TableHead>
                          <TableHead className="text-muted-foreground">详情</TableHead>
                          <TableHead className="text-muted-foreground">IP地址</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs.map((log) => (
                          <TableRow key={log.id} className="border-border hover:bg-muted/50">
                            <TableCell className="text-muted-foreground">
                              {new Date(log.createdAt).toLocaleString("zh-CN")}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {log.userId || "系统"}
                            </TableCell>
                            <TableCell className="text-foreground">
                              {log.action}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {log.targetType || "-"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {log.targetId || "-"}
                            </TableCell>
                            <TableCell className="text-muted-foreground max-w-xs truncate">
                              {log.details || "-"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {log.ipAddress || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="access" className="mt-6">
                {/* 2D Map Visualization */}
                <div 
                  ref={containerRef}
                  className="mb-8 bg-card rounded-xl overflow-hidden border border-border h-[500px] relative shadow-sm"
                >
                  <div className="absolute top-4 left-4 z-10 bg-background/80 backdrop-blur px-3 py-1 rounded-full border border-border flex items-center gap-2 shadow-sm">
                    <Globe className="h-4 w-4 text-primary" />
                    <span className="text-xs text-foreground">实时访问分布 (2D)</span>
                  </div>
                  <div className="w-full h-full flex items-center justify-center bg-[#020617]">
                    <ComposableMap
                      projection="geoMercator"
                      projectionConfig={{
                        scale: 120,
                      }}
                      width={dimensions.width}
                      height={dimensions.height}
                    >
                      <ZoomableGroup center={[0, 0]} zoom={1}>
                        <Geographies geography={geoUrl}>
                          {({ geographies }) =>
                            geographies.map((geo) => (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                fill="#1e293b"
                                stroke="#0f172a"
                                strokeWidth={0.5}
                                style={{
                                  default: { outline: "none" },
                                  hover: { fill: "#334155", outline: "none" },
                                  pressed: { outline: "none" },
                                }}
                              />
                            ))
                          }
                        </Geographies>
                        {globeData.map((point, index) => (
                          <Marker key={index} coordinates={[point.lng, point.lat]}>
                            <circle r={4} fill={point.color} stroke="#fff" strokeWidth={1} />
                            <text
                              textAnchor="middle"
                              y={-10}
                              style={{ fontFamily: "system-ui", fill: "#fff", fontSize: "10px" }}
                            >
                              {point.label.split(' ')[0]}
                            </text>
                          </Marker>
                        ))}
                      </ZoomableGroup>
                    </ComposableMap>
                  </div>
                </div>

                {accessLoading ? (
                  <p className="text-center text-muted-foreground py-8">加载中...</p>
                ) : !accessLogs || accessLogs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">暂无访问日志</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border hover:bg-muted/50">
                          <TableHead className="text-muted-foreground">时间</TableHead>
                          <TableHead className="text-muted-foreground">文件ID</TableHead>
                          <TableHead className="text-muted-foreground">用户ID</TableHead>
                          <TableHead className="text-muted-foreground">访问类型</TableHead>
                          <TableHead className="text-muted-foreground">IP地址</TableHead>
                          <TableHead className="text-muted-foreground">User Agent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accessLogs.map((log) => (
                          <TableRow key={log.id} className="border-border hover:bg-muted/50">
                            <TableCell className="text-muted-foreground">
                              {new Date(log.createdAt).toLocaleString("zh-CN")}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {log.fileId}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {log.userId || "游客"}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  log.accessType === "download"
                                    ? "bg-green-500/20 text-green-500"
                                    : log.accessType === "preview"
                                    ? "bg-blue-500/20 text-blue-500"
                                    : "bg-red-500/20 text-red-500"
                                }`}
                              >
                                {log.accessType === "download"
                                  ? "下载"
                                  : log.accessType === "preview"
                                  ? "预览"
                                  : "密码错误"}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {log.ipAddress || "-"}
                            </TableCell>
                            <TableCell className="text-muted-foreground max-w-xs truncate">
                              {log.userAgent || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

