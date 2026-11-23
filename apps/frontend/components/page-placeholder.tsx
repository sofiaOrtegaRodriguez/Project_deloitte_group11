/** Temporary content for pages whose features haven't been built yet. */
export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="rounded-lg border border-dashed bg-background p-8 text-center text-muted-foreground">
        <p>{description}</p>
        <p className="mt-1 text-xs">This page is not available yet.</p>
      </div>
    </div>
  );
}
