export default function PageSkeleton({ cards = 4 }) {
return (
<div className="skeleton-page">
<div className="skeleton skeleton-header-bar" />
<div className="skeleton skeleton-sub-bar" />
<div className="skeleton-card-row">
{Array.from({ length: cards }).map((_, i) => (
<div className="skeleton skeleton-card" key={i} />
))}
</div>
</div>
);
}
