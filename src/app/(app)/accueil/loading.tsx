import { Skeleton } from "@/components/ui/skeleton";
import { BalanceSkeleton, ListSkeleton } from "./sections";

export default function AccueilLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <BalanceSkeleton />
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <ListSkeleton rows={2} />
    </div>
  );
}
