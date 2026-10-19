export default function PresetListSkeleton({ count = 8 }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col rounded-2xl border border-line bg-surface p-4 sm:p-5"
          aria-hidden="true"
        >
          <div className="flex items-start justify-between">
            <div className="h-3 w-6 animate-pulse rounded-full bg-line" />
            <div className="size-4 animate-pulse rounded bg-line" />
          </div>
          <div className="mt-4 h-4 w-24 animate-pulse rounded-full bg-line" />
          <div className="mt-2 h-3 w-32 animate-pulse rounded-full bg-line" />
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="h-8 animate-pulse rounded-lg bg-line" />
            <div className="h-8 animate-pulse rounded-lg bg-line" />
          </div>
        </div>
      ))}
    </div>
  );
}
