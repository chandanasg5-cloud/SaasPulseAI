import { CopilotChat } from "@/components/CopilotChat";

export default async function CopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <CopilotChat initialQuestion={q} />;
}
