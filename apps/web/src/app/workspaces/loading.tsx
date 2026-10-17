import { SkeletonStack } from "@/components/app";

export default function WorkspacesLoading() {
  return (
    <div style={{ padding: "1.25rem 1.15rem", maxWidth: "48rem" }}>
      <SkeletonStack rows={4} />
    </div>
  );
}
