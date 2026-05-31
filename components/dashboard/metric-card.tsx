import { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
};

export function MetricCard({ title, value, description, icon: Icon }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-zinc-400">{title}</CardTitle>
        <Icon className="size-4 text-zinc-500" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-zinc-100">{value}</div>
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
      </CardContent>
    </Card>
  );
}

