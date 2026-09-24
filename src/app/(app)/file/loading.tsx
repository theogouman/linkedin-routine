import { SkeletonCard, SkeletonHeader } from "@/shared/motion/Skeleton";

export default function QueueLoading() {
  return (
    <>
      <SkeletonHeader />
      <div className="flex flex-col gap-3">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={5} />
      </div>
    </>
  );
}
