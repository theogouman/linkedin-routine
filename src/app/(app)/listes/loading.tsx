import { SkeletonHeader, SkeletonRow } from "@/shared/motion/Skeleton";

export default function ListsLoading() {
  return (
    <>
      <SkeletonHeader />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="nc-card px-4">
            <SkeletonRow />
          </div>
        ))}
      </div>
    </>
  );
}
