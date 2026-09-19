import Results from "@/components/Results";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Results runId={Number(id)} />;
}
