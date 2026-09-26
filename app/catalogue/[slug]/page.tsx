import Catalogue from "./Catalogue";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params;
  const { preview } = await searchParams;
  return <Catalogue slug={slug} preview={preview === "1"} />;
}
