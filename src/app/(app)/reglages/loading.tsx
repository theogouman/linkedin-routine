import { SkeletonCard, SkeletonHeader } from "@/shared/motion/Skeleton";

export default function SettingsLoading() {
  return (
    <>
      <SkeletonHeader />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonCard key={index} lines={2} />
        ))}
      </div>
    </>
  );
}
