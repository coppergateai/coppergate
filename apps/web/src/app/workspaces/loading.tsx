import { SkeletonStack } from "@/components/app";

export default function WorkspacesLoading() {
  return (
    <div
      style={{
        padding: "1.5rem 1.5rem 2.5rem",
        display: "grid",
        gap: "1.25rem",
      }}
    >
      <SkeletonStack rows={2} />
      <SkeletonStack rows={3} />
    </div>
  );
}
