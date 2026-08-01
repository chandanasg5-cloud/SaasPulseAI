import { getCustomerSegments } from "@/lib/api";
import { SegmentCard } from "@/components/SegmentCard";

export default async function SegmentsPage() {
  const { segments } = await getCustomerSegments();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">SaaSPulse AI — Customer Segmentation</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {segments.map((s) => (
          <SegmentCard key={s.segment_label} segment={s} />
        ))}
      </div>
    </main>
  );
}
