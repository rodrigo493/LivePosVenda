import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  variant?: "default" | "primary" | "warning" | "success";
  onClick?: () => void;
}

const variantStyles = {
  default: "bg-card border shadow-card",
  primary: "bg-primary text-primary-foreground border-primary",
  warning: "bg-warning/10 border-warning/20",
  success: "bg-success/10 border-success/20",
};

const iconStyles = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary-foreground/20 text-primary-foreground",
  warning: "bg-warning/20 text-warning",
  success: "bg-success/20 text-success",
};

export function KpiCard({ title, value, subtitle, icon: Icon, trend, variant = "default", onClick }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className={`rounded-xl border p-5 ${variantStyles[variant]} transition-shadow hover:shadow-card-hover ${onClick ? "cursor-pointer hover:ring-1 hover:ring-primary/30" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className={`text-xs font-medium uppercase tracking-wider ${variant === "primary" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            {title}
          </p>
          <p className="text-2xl font-display font-bold">{value}</p>
          {subtitle && (
            <p className={`text-xs ${variant === "primary" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
              {subtitle}
            </p>
          )}
          {trend && (
            <p className={`text-xs font-medium ${trend.positive ? "text-success" : "text-destructive"}`}>
              {trend.positive ? "↑" : "↓"} {Math.abs(trend.value)}% vs mês anterior
            </p>
          )}
        </div>
        <div className={`p-2.5 rounded-lg ${iconStyles[variant]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </motion.div>
  );
}
