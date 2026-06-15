export default function Skeleton({ lines = 3, height = 16 }) {
  return (
    <div className="skeleton-block">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ height, width: i === lines - 1 ? '70%' : '100%' }} />
      ))}
    </div>
  );
}
