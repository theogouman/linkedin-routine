import { SkeletonCard, SkeletonHeader } from "@/shared/motion/Skeleton";

export default function InboxLoading() {
  return (
    <>
      <SkeletonHeader />
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonCard key={index} lines={2} />
        ))}
      </div>
    </>
  );
}
