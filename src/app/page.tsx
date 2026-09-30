import { getStore } from "@/lib/store";
import { Atlas } from "@/components/Atlas";

export const dynamic = "force-dynamic";

export default async function Home() {
  const store = getStore();
  const surveys = await store.summarize();
  return <Atlas initialSurveys={surveys} storage={store.location} storageKind={store.kind} />;
}
