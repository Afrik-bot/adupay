import { Skeleton } from "@/components/ui/skeleton";

export default function ComptesLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-12 w-40" />
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: 2 }, (_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
